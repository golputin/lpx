// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StableBox Mystery Box
/// @notice Pay OPEN_COST SBOX to open a box; receive random USDT prize.
/// @dev RNG is block-based (prevrandao + entropy). Fine for demo / degen toy;
///      production should use VRF or commit-reveal.
contract MysteryBox is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable sbox;
    IERC20 public immutable prizeToken; // USDT0 / WgUSDT

    /// @notice SBOX required per open (default 0.5 SBOX ≈ $0.5 if SBOX ~ $1)
    uint256 public openCost;

    /// @notice Whether opened SBOX is burned (true) or sent to treasury (false)
    bool public burnPayment = true;
    address public treasury;

    uint256 public totalOpened;
    uint256 public totalPaidOut;

    struct Tier {
        uint256 amount; // prize token amount (wei)
        uint16 weightBps; // out of 10_000
    }

    Tier[] public tiers;

    struct OpenResult {
        address user;
        uint256 tierIndex;
        uint256 prizeAmount;
        uint256 timestamp;
        bytes32 seed;
    }

    OpenResult[] public history;
    mapping(address => uint256[]) public userOpens;

    event Opened(
        address indexed user,
        uint256 indexed tierIndex,
        uint256 prizeAmount,
        uint256 openCostPaid,
        bytes32 seed
    );
    event OpenCostUpdated(uint256 openCost);
    event TiersUpdated();
    event PoolFunded(address indexed from, uint256 amount);
    event PoolWithdrawn(address indexed to, uint256 amount);
    event PaymentModeUpdated(bool burnPayment, address treasury);

    error InvalidTiers();
    error InsufficientPool(uint256 need, uint256 have);
    error ZeroAddress();
    error EmptyTiers();

    constructor(
        address sbox_,
        address prizeToken_,
        address owner_,
        uint256 openCost_
    ) Ownable(owner_) {
        if (sbox_ == address(0) || prizeToken_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        sbox = IERC20(sbox_);
        prizeToken = IERC20(prizeToken_);
        openCost = openCost_;
        treasury = owner_;

        // Default odds: 90% → 0.25, 9% → 1.0, 1% → 5.0 (18 decimals)
        tiers.push(Tier({amount: 0.25 ether, weightBps: 9000}));
        tiers.push(Tier({amount: 1 ether, weightBps: 900}));
        tiers.push(Tier({amount: 5 ether, weightBps: 100}));
    }

    // ─── User ───────────────────────────────────────────────────────────

    /// @param userEntropy extra salt from client (timestamp, nonce, etc.)
    function openBox(uint256 userEntropy) external nonReentrant returns (uint256 tierIndex, uint256 prize) {
        if (tiers.length == 0) revert EmptyTiers();

        // Pull payment
        sbox.safeTransferFrom(msg.sender, address(this), openCost);
        if (burnPayment) {
            // If SBOX supports burn via transfer to 0xdead or has burnFrom — we use dead address
            // when token has no public burnFrom for operator. Prefer burn if token is ours.
            _consumeSbox(openCost);
        } else {
            sbox.safeTransfer(treasury, openCost);
        }

        // Pick tier
        bytes32 seed = keccak256(
            abi.encodePacked(
                block.prevrandao,
                block.timestamp,
                block.number,
                msg.sender,
                totalOpened,
                userEntropy,
                address(this)
            )
        );
        tierIndex = _pickTier(seed);
        prize = tiers[tierIndex].amount;

        uint256 bal = prizeToken.balanceOf(address(this));
        if (bal < prize) revert InsufficientPool(prize, bal);

        prizeToken.safeTransfer(msg.sender, prize);

        totalOpened += 1;
        totalPaidOut += prize;

        uint256 idx = history.length;
        history.push(
            OpenResult({
                user: msg.sender,
                tierIndex: tierIndex,
                prizeAmount: prize,
                timestamp: block.timestamp,
                seed: seed
            })
        );
        userOpens[msg.sender].push(idx);

        emit Opened(msg.sender, tierIndex, prize, openCost, seed);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function poolBalance() external view returns (uint256) {
        return prizeToken.balanceOf(address(this));
    }

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    function getTiers() external view returns (Tier[] memory) {
        return tiers;
    }

    function historyLength() external view returns (uint256) {
        return history.length;
    }

    function getHistory(uint256 offset, uint256 limit)
        external
        view
        returns (OpenResult[] memory items)
    {
        uint256 n = history.length;
        if (offset >= n) return new OpenResult[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        items = new OpenResult[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            // newest first
            items[i - offset] = history[n - 1 - i];
        }
    }

    function getUserOpens(address user) external view returns (uint256[] memory) {
        return userOpens[user];
    }

    /// @notice Expected value of one open (in prize token units)
    function expectedPrize() external view returns (uint256 ev) {
        for (uint256 i = 0; i < tiers.length; i++) {
            ev += (tiers[i].amount * tiers[i].weightBps) / 10_000;
        }
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setOpenCost(uint256 openCost_) external onlyOwner {
        openCost = openCost_;
        emit OpenCostUpdated(openCost_);
    }

    function setTiers(uint256[] calldata amounts, uint16[] calldata weightsBps) external onlyOwner {
        if (amounts.length == 0 || amounts.length != weightsBps.length) revert InvalidTiers();
        uint256 sum;
        for (uint256 i = 0; i < weightsBps.length; i++) {
            sum += weightsBps[i];
        }
        if (sum != 10_000) revert InvalidTiers();

        delete tiers;
        for (uint256 i = 0; i < amounts.length; i++) {
            tiers.push(Tier({amount: amounts[i], weightBps: weightsBps[i]}));
        }
        emit TiersUpdated();
    }

    function setPaymentMode(bool burnPayment_, address treasury_) external onlyOwner {
        if (!burnPayment_ && treasury_ == address(0)) revert ZeroAddress();
        burnPayment = burnPayment_;
        if (treasury_ != address(0)) treasury = treasury_;
        emit PaymentModeUpdated(burnPayment, treasury);
    }

    function fundPool(uint256 amount) external {
        prizeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(msg.sender, amount);
    }

    function withdrawPool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        prizeToken.safeTransfer(to, amount);
        emit PoolWithdrawn(to, amount);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        // Allow rescuing non-prize tokens; prize use withdrawPool
        IERC20(token).safeTransfer(to, amount);
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _pickTier(bytes32 seed) internal view returns (uint256) {
        uint256 roll = uint256(seed) % 10_000;
        uint256 acc;
        for (uint256 i = 0; i < tiers.length; i++) {
            acc += tiers[i].weightBps;
            if (roll < acc) return i;
        }
        return tiers.length - 1;
    }

    function _consumeSbox(uint256 amount) internal {
        // Prefer burn if token implements burn(uint256) via low-level call on this contract's balance
        // SBOX is Ownable mint; users hold tokens — burn from this contract after transferFrom:
        (bool ok, ) = address(sbox).call(abi.encodeWithSignature("burn(uint256)", amount));
        if (!ok) {
            // fallback: send to dead address
            sbox.safeTransfer(address(0x000000000000000000000000000000000000dEaD), amount);
        }
    }
}

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StableBox MysteryBox", function () {
  async function fixture() {
    const [owner, user, other] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("SBOX");
    // reuse SBOX as mock USDT too (18 dec)
    const usdt = await Mock.deploy(owner.address, ethers.parseEther("1000000"));
    const sbox = await Mock.deploy(owner.address, ethers.parseEther("1000000"));

    const Box = await ethers.getContractFactory("MysteryBox");
    const box = await Box.deploy(
      await sbox.getAddress(),
      await usdt.getAddress(),
      owner.address,
      ethers.parseEther("0.5")
    );

    // fund prize pool with 1000 USDT
    await usdt.approve(await box.getAddress(), ethers.parseEther("1000"));
    await box.fundPool(ethers.parseEther("1000"));

    // give user SBOX
    await sbox.transfer(user.address, ethers.parseEther("100"));
    await sbox.connect(user).approve(await box.getAddress(), ethers.MaxUint256);

    return { owner, user, other, usdt, sbox, box };
  }

  it("has default tiers 90/9/1", async function () {
    const { box } = await fixture();
    const tiers = await box.getTiers();
    expect(tiers.length).to.equal(3);
    expect(tiers[0].amount).to.equal(ethers.parseEther("0.25"));
    expect(tiers[0].weightBps).to.equal(9000);
    expect(tiers[1].amount).to.equal(ethers.parseEther("1"));
    expect(tiers[1].weightBps).to.equal(900);
    expect(tiers[2].amount).to.equal(ethers.parseEther("5"));
    expect(tiers[2].weightBps).to.equal(100);
  });

  it("openBox charges 0.5 SBOX and pays a prize", async function () {
    const { user, sbox, usdt, box } = await fixture();
    const beforeS = await sbox.balanceOf(user.address);
    const beforeU = await usdt.balanceOf(user.address);

    const tx = await box.connect(user).openBox(12345);
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => {
        try {
          return box.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "Opened");

    expect(ev).to.not.equal(undefined);
    const prize = ev.args.prizeAmount;
    expect([ethers.parseEther("0.25"), ethers.parseEther("1"), ethers.parseEther("5")]).to.deep.include(
      prize
    );

    expect(await sbox.balanceOf(user.address)).to.equal(beforeS - ethers.parseEther("0.5"));
    expect(await usdt.balanceOf(user.address)).to.equal(beforeU + prize);
    expect(await box.totalOpened()).to.equal(1n);
  });

  it("expected prize is ~0.3825 USDT", async function () {
    const { box } = await fixture();
    const ev = await box.expectedPrize();
    // 0.25*0.9 + 1*0.09 + 5*0.01 = 0.225 + 0.09 + 0.05 = 0.365
    expect(ev).to.equal(ethers.parseEther("0.365"));
  });

  it("reverts when pool empty for large prize after drain", async function () {
    const { owner, user, usdt, box } = await fixture();
    // withdraw almost all
    const bal = await box.poolBalance();
    await box.withdrawPool(owner.address, bal - ethers.parseEther("0.1"));
    // force many opens until fail — or set only 5$ tier
    await box.setTiers([ethers.parseEther("5")], [10000]);
    await expect(box.connect(user).openBox(1)).to.be.reverted;
  });

  it("distribution roughly matches weights over many opens", async function () {
    const { owner, user, sbox, usdt, box } = await fixture();
    await usdt.approve(await box.getAddress(), ethers.parseEther("50000"));
    await box.fundPool(ethers.parseEther("50000"));
    await sbox.transfer(user.address, ethers.parseEther("10000"));

    const counts = [0, 0, 0];
    const N = 200;
    for (let i = 0; i < N; i++) {
      const tx = await box.connect(user).openBox(i + 1);
      const rc = await tx.wait();
      const ev = rc.logs
        .map((l) => {
          try {
            return box.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "Opened");
      counts[Number(ev.args.tierIndex)]++;
    }
    // 90% of 200 = 180; allow wide band for tiny sample RNG
    expect(counts[0]).to.be.greaterThan(150);
    expect(counts[2]).to.be.lessThan(15);
  });
});

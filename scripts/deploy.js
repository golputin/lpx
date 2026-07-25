const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const prize =
    process.env.PRIZE_TOKEN ||
    "0x817997ca8394e26cce3de3a076a4889b27dbf9de"; // WgUSDT on Stable 988
  const openCost = hre.ethers.parseEther(process.env.OPEN_COST_SBOX || "0.5");
  const supply = hre.ethers.parseEther(process.env.SBOX_SUPPLY || "1000000");

  const SBOX = await hre.ethers.getContractFactory("SBOX");
  const sbox = await SBOX.deploy(deployer.address, supply);
  await sbox.waitForDeployment();
  const sboxAddr = await sbox.getAddress();
  console.log("SBOX:", sboxAddr);

  const Box = await hre.ethers.getContractFactory("MysteryBox");
  const box = await Box.deploy(sboxAddr, prize, deployer.address, openCost);
  await box.waitForDeployment();
  const boxAddr = await box.getAddress();
  console.log("MysteryBox:", boxAddr);
  console.log("Prize token:", prize);
  console.log("Open cost:", hre.ethers.formatEther(openCost), "SBOX");

  const out = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    sbox: sboxAddr,
    mysteryBox: boxAddr,
    prizeToken: prize,
    openCostSbox: openCost.toString(),
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hre.network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("Wrote", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

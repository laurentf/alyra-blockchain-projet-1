import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the VotingFactory — the entry point of the improved version.
 * From the deployed factory, anyone calls `createVoting(title)` to spin up
 * their own VotingPlus election (no constructor argument needed here).
 *
 * Deploy:
 *   npx hardhat ignition deploy ignition/modules/VotingFactory.ts --network sepolia
 */
export default buildModule("VotingFactoryModule", (m) => {
  const factory = m.contract("VotingFactory");

  return { factory };
});

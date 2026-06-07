import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys a standalone VotingPlus election (without going through the factory).
 * The title and admin are Ignition parameters: the admin defaults to the
 * deployer account (m.getAccount(0)).
 *
 * Deploy with defaults:
 *   npx hardhat ignition deploy ignition/modules/VotingPlus.ts --network sepolia
 *
 * Deploy with a custom title (parameters file or inline):
 *   npx hardhat ignition deploy ignition/modules/VotingPlus.ts \
 *     --parameters '{"VotingPlusModule":{"title":"Budget 2026"}}' --network sepolia
 */
export default buildModule("VotingPlusModule", (m) => {
  const title = m.getParameter("title", "My election");
  const admin = m.getParameter("admin", m.getAccount(0));

  const voting = m.contract("VotingPlus", [title, admin]);

  return { voting };
});

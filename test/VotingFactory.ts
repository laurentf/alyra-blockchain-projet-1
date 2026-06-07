import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("VotingFactory", function () {
  let admin: any, alice: any, bob: any;
  let factory: any;

  beforeEach(async function () {
    [admin, alice, bob] = await ethers.getSigners();
    factory = await ethers.deployContract("VotingFactory");
  });

  it("starts with an empty catalog", async function () {
    expect(await factory.deployedVotingsCount()).to.equal(0n);
  });

  it("creates an election and records it in the catalog", async function () {
    await expect(factory.createVoting("Budget 2026")).to.emit(factory, "VotingCreated");
    expect(await factory.deployedVotingsCount()).to.equal(1n);
  });

  it("emits VotingCreated with the new address, the caller and the title", async function () {
    const tx = await factory.connect(alice).createVoting("Budget 2026");
    const addr = await factory.deployedVotings(0);
    await expect(tx)
      .to.emit(factory, "VotingCreated")
      .withArgs(addr, alice.address, "Budget 2026");
  });

  it("makes the createVoting caller the admin of the new election", async function () {
    await factory.connect(alice).createVoting("Alice's election");
    const election = await ethers.getContractAt(
      "VotingPlus",
      await factory.deployedVotings(0),
    );

    // Owner is the caller, NOT the factory.
    expect(await election.owner()).to.equal(alice.address);
    expect(await election.owner()).to.not.equal(await factory.getAddress());
    expect(await election.electionTitle()).to.equal("Alice's election");
    expect(await election.currentWorkflowStatus()).to.equal(0);
  });

  it("lets different callers own their own elections", async function () {
    await factory.connect(alice).createVoting("Alice vote");
    await factory.connect(bob).createVoting("Bob vote");

    expect(await factory.deployedVotingsCount()).to.equal(2n);

    const aliceElection = await ethers.getContractAt(
      "VotingPlus",
      await factory.deployedVotings(0),
    );
    const bobElection = await ethers.getContractAt(
      "VotingPlus",
      await factory.deployedVotings(1),
    );

    expect(await aliceElection.owner()).to.equal(alice.address);
    expect(await bobElection.owner()).to.equal(bob.address);
  });

  it("propagates the title validation from VotingPlus (too short)", async function () {
    const VotingPlus = await ethers.getContractFactory("VotingPlus");
    await expect(factory.createVoting("ab")).to.be.revertedWithCustomError(
      VotingPlus,
      "TitleTooShort",
    );
  });

  it("produces a fully working election end-to-end through the factory", async function () {
    const [, alice, bob, carol] = await ethers.getSigners();

    await factory.connect(alice).createVoting("Conseil");
    const election = await ethers.getContractAt(
      "VotingPlus",
      await factory.deployedVotings(0),
    );

    // alice (the createVoting caller) is the admin and drives the whole workflow
    await election.connect(alice).registerVoter(bob.address);
    await election.connect(alice).registerVoter(carol.address);
    await election.connect(alice).closeVoterRegistrationAndStartProposalsRegistration();
    await election.connect(bob).addProposal("Build a park", "");
    await election.connect(carol).addProposal("Build a pool", "");
    await election.connect(alice).closeProposalsRegistration();
    await election.connect(alice).startVotingSession();
    await election.connect(bob).vote(0);
    await election.connect(carol).vote(0); // Park = 2
    await election.connect(alice).closeVotingSession();
    await election.connect(alice).tallyVotes();

    expect(await election.hasWinner()).to.equal(true);
    expect((await election.getWinner()).title).to.equal("Build a park");
    expect(await election.votesCount()).to.equal(2n);
  });
});

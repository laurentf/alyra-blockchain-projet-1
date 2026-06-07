// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./VotingPlus.sol";

/// @title VotingFactory - deploys VotingPlus elections on demand
/// @author laurentf
/// @notice Anyone can create a named election in one transaction and becomes
///         its administrator. The factory keeps the public catalog of every
///         election it deployed.
/// @dev Open service: the factory is not Ownable and holds no power over the
///      elections it creates - ownership goes straight to the caller, and
///      VotingPlus locks it for life.
contract VotingFactory {
    /// @notice Every election deployed by this factory, in creation order.
    address[] public deployedVotings;

    /// @notice Emitted when a new election is created.
    /// @param votingAddress The address of the new VotingPlus contract.
    /// @param admin The caller, administrator of the new election.
    /// @param title The election name.
    event VotingCreated(
        address indexed votingAddress,
        address indexed admin,
        string title
    );

    /// @notice Deploys a new VotingPlus election administered by the caller.
    /// @dev Here msg.sender is the caller of createVoting - exactly the
    ///      address VotingPlus must receive as admin, since inside its own
    ///      constructor msg.sender would be this factory.
    /// @param _title The election name (validated by VotingPlus, >= 3 bytes).
    /// @return votingAddress The address of the newly deployed election.
    function createVoting(
        string calldata _title
    ) external returns (address votingAddress) {
        VotingPlus voting = new VotingPlus(_title, msg.sender);
        votingAddress = address(voting);

        deployedVotings.push(votingAddress);

        emit VotingCreated(votingAddress, msg.sender, _title);
    }

    /// @notice Number of elections deployed by this factory.
    /// @dev The public array getter takes an index; this exposes the length.
    function deployedVotingsCount() external view returns (uint) {
        return deployedVotings.length;
    }
}

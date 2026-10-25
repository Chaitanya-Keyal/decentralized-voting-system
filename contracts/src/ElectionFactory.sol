// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {Election} from "./Election.sol";

/// @title ElectionFactory
/// @notice The only way to create an election. Each election is an EIP-1167 clone of one
/// implementation, which keeps creation cheap and means the rules cannot be upgraded mid-vote.
/// The factory keeps a list of every election it created, so auditors can tell genuine
/// elections from look-alikes.
contract ElectionFactory {
    /// @notice The election contract every clone forwards to.
    address public immutable implementation;

    /// @notice Whether an address is an election created by this factory.
    mapping(address election => bool created) public isElection;

    address[] private _elections;

    event ElectionCreated(
        address indexed election, address indexed authority, address indexed registrar
    );

    error ZeroAddress();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ZeroAddress();
        implementation = implementation_;
    }

    /// @notice Creates and configures an election. The caller becomes its authority.
    /// @param registrar Address that verifies voters and publishes the voter list.
    /// @return election Address of the new election.
    function createElection(
        address registrar,
        string calldata title,
        string calldata metadataCid,
        Election.Schedule calldata schedule,
        Election.Candidate[] calldata candidates
    ) external returns (address election) {
        election = Clones.clone(implementation);
        isElection[election] = true;
        _elections.push(election);
        // Deploying a minimal proxy runs no code, so nothing can re-enter before this.
        // forge-lint: disable-next-line(reentrancy-events)
        emit ElectionCreated(election, msg.sender, registrar);

        Election(election)
            .initialize(msg.sender, registrar, title, metadataCid, schedule, candidates);
    }

    /// @notice Every election created so far, oldest first.
    /// @dev Meant for off-chain reads; use `electionCount` and `electionAt` to page through it.
    function elections() external view returns (address[] memory) {
        return _elections;
    }

    function electionCount() external view returns (uint256) {
        return _elections.length;
    }

    function electionAt(uint256 index) external view returns (address) {
        return _elections[index];
    }
}

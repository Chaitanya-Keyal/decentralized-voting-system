// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {Election} from "./Election.sol";
import {TallyLib} from "./TallyLib.sol";

/// @title ElectionFactory
/// @notice The only way to create an election. Each election is an EIP-1167 clone of one
/// implementation, which keeps creation cheap and means the rules cannot be upgraded mid-vote.
/// `isElection` tells genuine elections from look-alikes, and the `ElectionCreated` events list
/// every election the factory made.
contract ElectionFactory {
    /// @notice The election contract every clone forwards to.
    address public immutable implementation;

    /// @notice Whether an address is an election created by this factory.
    mapping(address election => bool created) public isElection;

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
    /// @param countingRule Plurality or approval, fixed for the life of the election.
    /// @return election Address of the new election.
    function createElection(
        address registrar,
        TallyLib.CountingRule countingRule,
        string calldata title,
        string calldata metadataCid,
        Election.Schedule calldata schedule,
        Election.Candidate[] calldata candidates
    ) external returns (address election) {
        election = Clones.clone(implementation);
        isElection[election] = true;
        // Deploying a minimal proxy runs no code, so nothing can re-enter before this.
        // forge-lint: disable-next-line(reentrancy-events)
        emit ElectionCreated(election, msg.sender, registrar);

        Election(election)
            .initialize(
                Election.Setup(msg.sender, registrar, countingRule),
                title,
                metadataCid,
                schedule,
                candidates
            );
    }
}

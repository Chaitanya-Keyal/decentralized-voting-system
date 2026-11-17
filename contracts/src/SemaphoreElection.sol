// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";

import {Election} from "./Election.sol";

/// @title SemaphoreElection
/// @notice Tier 3: anonymous ballots. Registered voters are identity commitments in a Poseidon
/// LeanIMT whose root the registrar publishes. A ballot carries a Semaphore proof that its sender
/// knows the secret behind one of those commitments, and a nullifier that is the same for every
/// ballot from that secret in this election, so each voter votes once without revealing which
/// voter they are.
/// @dev The proof's public inputs are built here, never taken from the caller: the published
/// root, the nullifier, the choice as the signal, this election's address as the scope, and the
/// tree depth implied by the published voter count. The ballot never reads its sender, so any
/// account may submit it: usually DVote's relayer does, and pays the gas.
contract SemaphoreElection is Election {
    /// @notice The Groth16 verifier for Semaphore v4's circuits, one verification key per depth.
    ISemaphoreVerifier public immutable verifier;

    error InvalidProof();

    constructor(ISemaphoreVerifier verifier_) {
        if (address(verifier_) == address(0)) revert ZeroAddress();
        verifier = verifier_;
    }

    function tier() external pure override returns (uint8) {
        return 3;
    }

    /// @notice Casts an anonymous ballot.
    /// @param choice A candidate index, or a bitmask of approved candidates under approval
    /// voting. The proof commits to it, so it cannot be changed in transit.
    /// @param nullifier The voter's nullifier for this election.
    /// @param points The Groth16 proof, packed as Semaphore v4 packs it.
    function castVote(uint256 choice, uint256 nullifier, uint256[8] calldata points) external {
        _requireVotingOpen();
        uint256[4] memory signals = [uint256(voterRoot), nullifier, _hash(choice), _hash(scope())];
        bool valid = verifier.verifyProof(
            [points[0], points[1]],
            [[points[2], points[3]], [points[4], points[5]]],
            [points[6], points[7]],
            signals,
            merkleTreeDepth()
        );
        if (!valid) revert InvalidProof();
        _recordBallot(bytes32(nullifier), choice);
    }

    /// @notice The Semaphore scope of this election's ballots: its own address. A nullifier is
    /// therefore different in every election, so ballots cannot be linked across elections.
    function scope() public view returns (uint256) {
        return uint256(uint160(address(this)));
    }

    /// @notice The depth of the published voter tree, ceil(log2(voterCount)) and at least 1,
    /// which is the depth of a LeanIMT with that many leaves. It picks the verification key.
    /// @dev ceil(log2(n)) is floor(log2(n - 1)) + 1 for n >= 2. Computed in constant time from one
    /// storage read, so a ballot costs the same at every depth; a loop over the levels would add
    /// about 210 gas per level.
    function merkleTreeDepth() public view returns (uint256) {
        uint256 count = voterCount;
        return count <= 2 ? 1 : Math.log2(count - 1) + 1;
    }

    /// @dev Semaphore's hash of a signal or scope: keccak256, shifted into the SNARK field.
    function _hash(uint256 value) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(value))) >> 8;
    }
}

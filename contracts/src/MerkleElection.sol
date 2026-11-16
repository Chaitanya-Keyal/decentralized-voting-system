// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {Election} from "./Election.sol";

/// @title MerkleElection
/// @notice Tier 2: eligibility is a Merkle proof that the voter's address is on the published
/// voter list. There is no ballot privacy, since each ballot comes from the voter's own address,
/// and voters pay their own gas.
/// @dev The tree is OpenZeppelin's StandardMerkleTree with leaves of type `address`, so anyone can
/// rebuild it from the published list with OpenZeppelin's merkle-tree library and compare roots.
contract MerkleElection is Election {
    error NotEligible();

    function tier() external pure override returns (uint8) {
        return 2;
    }

    /// @notice Casts a ballot from a registered address.
    /// @param choice A candidate index, or a bitmask of approved candidates under approval voting.
    /// @param proof Merkle proof that `msg.sender` is on the published voter list.
    function castVote(uint256 choice, bytes32[] calldata proof) external {
        _requireVotingOpen();
        if (!MerkleProof.verifyCalldata(proof, voterRoot, voterLeaf(msg.sender))) {
            revert NotEligible();
        }
        _recordBallot(bytes32(uint256(uint160(msg.sender))), choice);
    }

    /// @notice The tree leaf for `voter`, hashed the way StandardMerkleTree hashes an `address`.
    function voterLeaf(address voter) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(voter))));
    }
}

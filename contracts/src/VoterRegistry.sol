// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title VoterRegistry
/// @notice The published voter list of one election: the Merkle root of the list, the number of
/// registered voters, and the IPFS address of the full list. All three are written together,
/// once, and never change afterwards.
/// @dev No voter data is stored on-chain. Anyone can download the list from IPFS, rebuild the
/// tree and check that it matches the root.
abstract contract VoterRegistry {
    /// @notice Merkle root of the voter list; zero until the list is published.
    bytes32 public voterRoot;

    /// @notice Number of registered voters. Accepted ballots can never exceed it.
    uint256 public voterCount;

    /// @notice IPFS address (CID) of the published voter list.
    string public voterListCid;

    /// @notice Emitted once, when the voter list is published and frozen.
    event VoterRootPublished(bytes32 indexed root, uint256 voterCount, string voterListCid);

    error VoterListAlreadyPublished();
    error InvalidVoterList();

    /// @notice Whether the voter list has been published.
    function isVoterListPublished() public view returns (bool) {
        return voterRoot != bytes32(0);
    }

    /// @dev Writes the root, the voter count and the list's address in one step. A list with no
    /// voters cannot be published; an election nobody registered for can only be cancelled.
    function _publishVoterList(bytes32 root, uint256 count, string calldata cid) internal {
        if (isVoterListPublished()) revert VoterListAlreadyPublished();
        if (root == bytes32(0) || count == 0 || bytes(cid).length == 0) revert InvalidVoterList();

        voterRoot = root;
        voterCount = count;
        voterListCid = cid;
        emit VoterRootPublished(root, count, cid);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";
import {Test} from "forge-std/Test.sol";

import {Election} from "../src/Election.sol";
import {ElectionFactory} from "../src/ElectionFactory.sol";
import {MerkleElection} from "../src/MerkleElection.sol";

/// @notice The gas of every step of a tier 2 election, for evaluation parameter A1. Ballots are
/// measured against a voter list of 1,024, a tree of depth 10.
/// @dev `pnpm gas:contracts` writes the figures to snapshots/tier2.json. It runs with call
/// isolation, so each call is measured as its own transaction, including the 21,000 base cost,
/// calldata and cold storage. A plain `forge test` runs the same steps without writing.
contract GasSnapshotTest is Test {
    uint256 internal constant DEPTH = 10;
    string internal constant CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

    address internal authority = makeAddr("authority");
    address internal registrar = makeAddr("registrar");
    address internal first = makeAddr("first voter");
    address internal second = makeAddr("second voter");
    address internal third = makeAddr("third voter");

    function test_tier2Election() public {
        // What a clone saves: a full copy of the election contract, deployed on its own.
        MerkleElection implementation = new MerkleElection();
        _snapshot("deploy a full election contract");
        ElectionFactory factory = new ElectionFactory(address(implementation));
        uint64 t = uint64(block.timestamp);
        Election.Schedule memory schedule =
            Election.Schedule(t + 1 days, t + 2 days, t + 3 days, t + 4 days);
        Election.Candidate[] memory candidates = new Election.Candidate[](3);
        candidates[0] = Election.Candidate("Aarav Mehta", CID);
        candidates[1] = Election.Candidate("Diya Nair", CID);
        candidates[2] = Election.Candidate("Kabir Rao", CID);

        vm.prank(authority);
        MerkleElection election = MerkleElection(
            factory.createElection(registrar, "Student Senate 2026", CID, schedule, candidates)
        );
        _snapshot("createElection");

        // The factory's list of elections is no longer empty, which makes later ones cheaper.
        vm.prank(authority);
        factory.createElection(registrar, "Hostel Council 2026", CID, schedule, candidates);
        _snapshot("createElection, a later election");

        vm.warp(schedule.registrationStart);
        election.openRegistration();
        _snapshot("openRegistration");

        // Three voters among the first four leaves of a tree of 2^DEPTH. Only their paths matter
        // to the contract, so every other node is arbitrary.
        bytes32 firstLeaf = election.voterLeaf(first);
        bytes32 secondLeaf = election.voterLeaf(second);
        bytes32 thirdLeaf = election.voterLeaf(third);
        bytes32 fourthLeaf = keccak256("fourth leaf");
        bytes32 left = Hashes.commutativeKeccak256(firstLeaf, secondLeaf);
        bytes32 right = Hashes.commutativeKeccak256(thirdLeaf, fourthLeaf);
        bytes32[] memory firstProof = new bytes32[](DEPTH);
        bytes32[] memory secondProof = new bytes32[](DEPTH);
        bytes32[] memory thirdProof = new bytes32[](DEPTH);
        (firstProof[0], firstProof[1]) = (secondLeaf, right);
        (secondProof[0], secondProof[1]) = (firstLeaf, right);
        (thirdProof[0], thirdProof[1]) = (fourthLeaf, left);
        bytes32 root = Hashes.commutativeKeccak256(left, right);
        for (uint256 level = 2; level < DEPTH; ++level) {
            bytes32 sibling = keccak256(abi.encode(level));
            firstProof[level] = sibling;
            secondProof[level] = sibling;
            thirdProof[level] = sibling;
            root = Hashes.commutativeKeccak256(root, sibling);
        }

        vm.warp(schedule.registrationEnd);
        vm.prank(registrar);
        election.publishVoterList(root, 2 ** DEPTH, CID);
        _snapshot("publishVoterList");

        vm.warp(schedule.votingStart);
        election.openVoting();
        _snapshot("openVoting");

        vm.prank(first);
        election.castVote(1, firstProof);
        _snapshot("castVote, first ballot");

        vm.prank(second);
        election.castVote(1, secondProof);
        _snapshot("castVote");

        // A candidate's first vote turns their count from zero to non-zero, the dearest write.
        vm.prank(third);
        election.castVote(2, thirdProof);
        _snapshot("castVote, a candidate's first vote");

        vm.warp(schedule.votingEnd);
        election.closeVoting();
        _snapshot("closeVoting");

        election.finalize();
        _snapshot("finalize");

        assertEq(election.tally()[1], 2);
        assertEq(election.tally()[2], 1);
    }

    function _snapshot(string memory name) internal {
        if (vm.envOr("GAS_SNAPSHOT", false)) vm.snapshotGasLastFrame("tier2", name);
    }
}

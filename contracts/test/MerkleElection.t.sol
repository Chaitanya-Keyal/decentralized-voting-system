// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";
import {Test} from "forge-std/Test.sol";

import {Election} from "../src/Election.sol";
import {ElectionFactory} from "../src/ElectionFactory.sol";
import {MerkleElection} from "../src/MerkleElection.sol";

contract MerkleElectionTest is Test {
    MerkleElection internal election;
    Election.Schedule internal schedule;

    address internal authority = makeAddr("authority");
    address internal registrar = makeAddr("registrar");
    address[4] internal voters;
    bytes32[4] internal leaves;
    bytes32 internal root;

    function setUp() public {
        ElectionFactory factory = new ElectionFactory(address(new MerkleElection()));

        uint64 t = uint64(block.timestamp);
        schedule = Election.Schedule(t + 100, t + 200, t + 300, t + 400);
        Election.Candidate[] memory candidates = new Election.Candidate[](2);
        candidates[0] = Election.Candidate("Alice", "");
        candidates[1] = Election.Candidate("Bob", "");

        vm.prank(authority);
        election =
            MerkleElection(factory.createElection(registrar, "Senate", "", schedule, candidates));

        // A four-leaf tree: root = H(H(l0, l1), H(l2, l3)), with sorted-pair hashing.
        for (uint256 i; i < 4; ++i) {
            voters[i] = makeAddr(string.concat("voter", vm.toString(i)));
            leaves[i] = election.voterLeaf(voters[i]);
        }
        root = Hashes.commutativeKeccak256(
            Hashes.commutativeKeccak256(leaves[0], leaves[1]),
            Hashes.commutativeKeccak256(leaves[2], leaves[3])
        );

        vm.warp(schedule.registrationStart);
        election.openRegistration();
        vm.warp(schedule.registrationEnd);
        vm.prank(registrar);
        election.publishVoterList(root, 4, "bafy-voter-list");
        vm.warp(schedule.votingStart);
        election.openVoting();
    }

    function test_castVote_registeredVoterIsCounted() public {
        vm.expectEmit(address(election));
        emit Election.VoteCast(bytes32(uint256(uint160(voters[0]))), 1);
        vm.prank(voters[0]);
        election.castVote(1, _proof(0));

        assertEq(election.tally()[1], 1);
        assertEq(election.ballotsCast(), 1);
    }

    function test_castVote_everyVoterOnceThenFinalize() public {
        uint256[4] memory choices = [uint256(0), 1, 1, 1];
        for (uint256 i; i < 4; ++i) {
            vm.prank(voters[i]);
            election.castVote(choices[i], _proof(i));
        }

        vm.warp(schedule.votingEnd);
        election.closeVoting();
        election.finalize();
        assertEq(election.tally()[0], 1);
        assertEq(election.tally()[1], 3);
        assertEq(election.winners()[0], 1);
    }

    function test_castVote_rejectsSecondBallot() public {
        vm.startPrank(voters[2]);
        election.castVote(0, _proof(2));
        vm.expectRevert(
            abi.encodeWithSelector(
                Election.AlreadyVoted.selector, bytes32(uint256(uint160(voters[2])))
            )
        );
        election.castVote(1, _proof(2));
        vm.stopPrank();
    }

    function test_castVote_rejectsAddressNotOnTheList() public {
        address outsider = makeAddr("outsider");
        vm.expectRevert(MerkleElection.NotEligible.selector);
        vm.prank(outsider);
        election.castVote(0, _proof(0));
    }

    function test_castVote_rejectsSomeoneElsesProof() public {
        vm.expectRevert(MerkleElection.NotEligible.selector);
        vm.prank(voters[1]);
        election.castVote(0, _proof(2));
    }

    function test_castVote_onlyWhileVotingIsOpen() public {
        vm.warp(schedule.votingEnd);
        vm.expectRevert(Election.VotingClosed.selector);
        vm.prank(voters[0]);
        election.castVote(0, _proof(0));
    }

    function test_voterLeaf_matchesStandardMerkleTreeEncoding() public view {
        assertEq(
            election.voterLeaf(voters[0]), keccak256(bytes.concat(keccak256(abi.encode(voters[0]))))
        );
    }

    function testFuzz_castVote_outsiderCannotUseAnyProof(address outsider, uint8 which) public {
        for (uint256 i; i < 4; ++i) {
            vm.assume(outsider != voters[i]);
        }
        bytes32[] memory proof = _proof(bound(which, 0, 3));
        vm.expectRevert(MerkleElection.NotEligible.selector);
        vm.prank(outsider);
        election.castVote(0, proof);
    }

    /// @dev Proof for leaf `i` in the four-leaf tree built in setUp.
    function _proof(uint256 i) internal view returns (bytes32[] memory proof) {
        proof = new bytes32[](2);
        proof[0] = leaves[i ^ 1];
        proof[1] = i < 2
            ? Hashes.commutativeKeccak256(leaves[2], leaves[3])
            : Hashes.commutativeKeccak256(leaves[0], leaves[1]);
    }
}

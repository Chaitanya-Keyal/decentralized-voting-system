// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Test} from "forge-std/Test.sol";

import {Election} from "../src/Election.sol";
import {ElectionFactory} from "../src/ElectionFactory.sol";
import {MerkleElection} from "../src/MerkleElection.sol";

contract ElectionFactoryTest is Test {
    ElectionFactory internal factory;
    MerkleElection internal implementation;
    Election.Schedule internal schedule;

    address internal authority = makeAddr("authority");
    address internal registrar = makeAddr("registrar");

    function setUp() public {
        implementation = new MerkleElection();
        factory = new ElectionFactory(address(implementation));
        uint64 t = uint64(block.timestamp);
        schedule = Election.Schedule(t + 100, t + 200, t + 300, t + 400);
    }

    function test_createElection_callerBecomesAuthority() public {
        vm.prank(authority);
        Election election = Election(_create("Senate"));

        assertTrue(election.hasRole(election.AUTHORITY_ROLE(), authority));
        assertTrue(election.hasRole(election.REGISTRAR_ROLE(), registrar));
        assertFalse(election.hasRole(election.AUTHORITY_ROLE(), address(factory)));
        assertEq(election.title(), "Senate");
    }

    function test_createElection_recordsEveryElection() public {
        address first = _create("First");
        address second = _create("Second");

        assertEq(factory.electionCount(), 2);
        assertEq(factory.electionAt(0), first);
        assertEq(factory.elections()[1], second);
        assertTrue(factory.isElection(first));
        assertFalse(factory.isElection(address(implementation)));
    }

    function test_createElection_emitsEvent() public {
        vm.expectEmit(false, true, true, false, address(factory));
        emit ElectionFactory.ElectionCreated(address(0), authority, registrar);
        vm.prank(authority);
        _create("Senate");
    }

    function test_createElection_clonesAreIndependent() public {
        Election first = Election(_create("First"));
        Election second = Election(_create("Second"));
        assertEq(first.title(), "First");
        assertEq(second.title(), "Second");
    }

    function test_createElection_cloneCannotBeReinitialized() public {
        Election election = Election(_create("Senate"));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        election.initialize(
            address(this), address(this), "Hijack", "", schedule, new Election.Candidate[](0)
        );
    }

    function test_constructor_rejectsZeroImplementation() public {
        vm.expectRevert(ElectionFactory.ZeroAddress.selector);
        new ElectionFactory(address(0));
    }

    function test_createElection_rejectsZeroRegistrar() public {
        Election.Candidate[] memory candidates = new Election.Candidate[](1);
        candidates[0] = Election.Candidate("Alice", "");
        vm.expectRevert(Election.ZeroAddress.selector);
        factory.createElection(address(0), "Senate", "", schedule, candidates);
    }

    function _create(string memory title) internal returns (address) {
        Election.Candidate[] memory candidates = new Election.Candidate[](2);
        candidates[0] = Election.Candidate("Alice", "");
        candidates[1] = Election.Candidate("Bob", "");
        return factory.createElection(registrar, title, "", schedule, candidates);
    }
}

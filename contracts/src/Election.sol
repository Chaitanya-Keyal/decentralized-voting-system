// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {TallyLib} from "./TallyLib.sol";
import {VoterRegistry} from "./VoterRegistry.sol";

/// @title Election
/// @notice The lifecycle, candidates, voter list and tally of one election. Each election is a
/// clone of a concrete implementation that adds `castVote`: tier 2 checks a Merkle proof, tier 3
/// a zero-knowledge proof.
/// @dev Phases only move forward, and every step needs its scheduled time to have passed and an
/// explicit transaction. The authority can configure the election until registration is due to
/// open, and change its candidates or cancel it until voting is due to open. Only the registrar
/// can publish the voter list, between the close of registration and the start of voting. Every
/// other step can be triggered by anyone, so the authority cannot stall an election it dislikes.
abstract contract Election is AccessControl, Initializable, VoterRegistry {
    enum Phase {
        Created,
        Registration,
        Voting,
        Tallying,
        Finalized,
        Cancelled
    }

    /// @notice Unix timestamps, in seconds. Registration closes before voting opens, leaving time
    /// for voters to check that they are on the published list.
    struct Schedule {
        uint64 registrationStart;
        uint64 registrationEnd;
        uint64 votingStart;
        uint64 votingEnd;
    }

    struct Candidate {
        string name;
        /// IPFS address of the candidate's manifesto; may be empty.
        string manifestoCid;
    }

    /// @notice Who runs an election and how it counts, fixed when it is created.
    struct Setup {
        address authority;
        address registrar;
        TallyLib.CountingRule countingRule;
    }

    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Bounds the loops that run over candidates.
    uint256 public constant MAX_CANDIDATES = 64;

    Phase public phase;
    Schedule public schedule;
    string public title;

    /// @notice IPFS address of the ballot description.
    string public metadataCid;

    /// @notice How ballots are counted, fixed when the election is created.
    TallyLib.CountingRule public countingRule;

    /// @notice Number of ballots accepted so far.
    uint256 public ballotsCast;

    /// @notice What makes a ballot unique: the voter's address in tier 2, the nullifier in tier 3.
    mapping(bytes32 key => bool used) public ballotKeyUsed;

    Candidate[] private _candidates;
    uint256[] private _tally;
    uint256[] private _winners;

    event Configured(string title, string metadataCid, Schedule schedule);
    event CandidatesSet(uint256 count);
    event PhaseChanged(Phase indexed from, Phase indexed to);
    /// @param choice A candidate index under plurality, a bitmask of candidates under approval.
    event VoteCast(bytes32 indexed key, uint256 indexed choice);
    event Finalized(uint256[] tally, uint256[] winners);

    error ZeroAddress();
    error WrongPhase(Phase current);
    error TooEarly(uint64 allowedFrom);
    error TooLate(uint64 deadline);
    error VotingClosed();
    error InvalidSchedule();
    error InvalidTitle();
    error InvalidCandidates();
    error VoterListNotPublished();
    error InvalidChoice(uint256 choice);
    error AlreadyVoted(bytes32 key);
    error BallotCapReached();

    modifier inPhase(Phase expected) {
        _requirePhase(expected);
        _;
    }

    modifier notBefore(uint64 time) {
        _requireNotBefore(time);
        _;
    }

    modifier onlyBefore(uint64 time) {
        _requireBefore(time);
        _;
    }

    modifier beforeVoting() {
        _requireBeforeVoting();
        _;
    }

    /// @dev The implementation is only ever used through clones.
    constructor() {
        _disableInitializers();
    }

    /// @notice Sets up a fresh clone. Called by the factory in the same transaction as the clone.
    function initialize(
        Setup calldata setup,
        string calldata title_,
        string calldata metadataCid_,
        Schedule calldata schedule_,
        Candidate[] calldata candidates_
    ) external initializer {
        if (setup.authority == address(0) || setup.registrar == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(AUTHORITY_ROLE, setup.authority);
        _grantRole(REGISTRAR_ROLE, setup.registrar);
        countingRule = setup.countingRule;
        _configure(title_, metadataCid_, schedule_);
        _setCandidates(candidates_);
    }

    // ---------------------------------------------------------------------------------------
    // Authority
    // ---------------------------------------------------------------------------------------

    /// @notice Changes the title, the ballot description and the schedule. Only possible before
    /// registration is due to open, so the schedule is fixed before anyone can register. The
    /// phase alone is not enough: registration is open from its start time even if nobody has
    /// recorded that on-chain yet.
    function configure(
        string calldata title_,
        string calldata metadataCid_,
        Schedule calldata schedule_
    )
        external
        onlyRole(AUTHORITY_ROLE)
        inPhase(Phase.Created)
        onlyBefore(schedule.registrationStart)
    {
        _configure(title_, metadataCid_, schedule_);
    }

    /// @notice Replaces the candidate list. Only possible before voting is due to open, so the
    /// meaning of a ballot never changes after it is cast.
    function setCandidates(Candidate[] calldata candidates_)
        external
        onlyRole(AUTHORITY_ROLE)
        beforeVoting
    {
        _setCandidates(candidates_);
    }

    /// @notice Cancels the election before voting is due to open. Once the voter list is
    /// published and the voting window has begun, the authority can no longer stop the vote. It
    /// can still cancel an election whose list never appeared, or whose voting window passed
    /// without voting opening.
    function cancel() external onlyRole(AUTHORITY_ROLE) {
        _requireCancellable();
        _setPhase(Phase.Cancelled);
    }

    // ---------------------------------------------------------------------------------------
    // Registrar
    // ---------------------------------------------------------------------------------------

    /// @notice Publishes and freezes the voter list. Only possible after registration closes and
    /// before voting is due to open, so every voter can check the list before anyone votes. An
    /// election whose list misses that window can only be cancelled.
    /// @param root Merkle root of the voter list.
    /// @param count Number of registered voters.
    /// @param cid IPFS address of the full list.
    function publishVoterList(bytes32 root, uint256 count, string calldata cid)
        external
        onlyRole(REGISTRAR_ROLE)
        inPhase(Phase.Registration)
        notBefore(schedule.registrationEnd)
        onlyBefore(schedule.votingStart)
    {
        _publishVoterList(root, count, cid);
    }

    // ---------------------------------------------------------------------------------------
    // Phase changes anyone can trigger once their time has come
    // ---------------------------------------------------------------------------------------

    function openRegistration()
        external
        inPhase(Phase.Created)
        notBefore(schedule.registrationStart)
    {
        _setPhase(Phase.Registration);
    }

    /// @notice Opens voting. Requires the voter list to have been published, and the voting
    /// window not to have passed.
    function openVoting()
        external
        inPhase(Phase.Registration)
        notBefore(schedule.votingStart)
        onlyBefore(schedule.votingEnd)
    {
        if (!isVoterListPublished()) revert VoterListNotPublished();
        _tally = new uint256[](_candidates.length);
        _setPhase(Phase.Voting);
    }

    function closeVoting() external inPhase(Phase.Voting) notBefore(schedule.votingEnd) {
        _setPhase(Phase.Tallying);
    }

    /// @notice Records the winners. The result cannot change afterwards.
    function finalize() external inPhase(Phase.Tallying) {
        _winners = TallyLib.pluralityWinners(_tally);
        _setPhase(Phase.Finalized);
        emit Finalized(_tally, _winners);
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    /// @notice The voting tier: 2 for wallet ballots against a Merkle root, 3 for anonymous
    /// ballots with a zero-knowledge proof.
    function tier() external pure virtual returns (uint8);

    function candidates() external view returns (Candidate[] memory) {
        return _candidates;
    }

    function candidateCount() external view returns (uint256) {
        return _candidates.length;
    }

    /// @notice Votes per candidate. Empty until voting opens.
    function tally() external view returns (uint256[] memory) {
        return _tally;
    }

    /// @notice Winning candidates. Empty until the election is finalized, or if nobody voted.
    function winners() external view returns (uint256[] memory) {
        return _winners;
    }

    // ---------------------------------------------------------------------------------------
    // For concrete implementations
    // ---------------------------------------------------------------------------------------

    /// @dev Reverts unless ballots are being accepted right now.
    function _requireVotingOpen() internal view {
        _requirePhase(Phase.Voting);
        if (block.timestamp >= schedule.votingEnd) revert VotingClosed();
    }

    /// @dev Records a ballot whose eligibility the caller has already proven. `key` must be unique
    /// per voter: their address in tier 2, the nullifier in tier 3. `choice` follows the counting
    /// rule: a candidate index, or a bitmask of approved candidates.
    function _recordBallot(bytes32 key, uint256 choice) internal {
        if (ballotKeyUsed[key]) revert AlreadyVoted(key);
        if (!TallyLib.isValidChoice(countingRule, _tally.length, choice)) {
            revert InvalidChoice(choice);
        }
        if (ballotsCast >= voterCount) revert BallotCapReached();

        ballotKeyUsed[key] = true;
        ++ballotsCast;
        TallyLib.count(_tally, countingRule, choice);
        // Callers only make internal or read-only calls before this, so nothing can re-enter.
        // forge-lint: disable-next-line(reentrancy-events)
        emit VoteCast(key, choice);
    }

    // ---------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------

    function _configure(
        string calldata title_,
        string calldata metadataCid_,
        Schedule calldata schedule_
    ) private {
        if (bytes(title_).length == 0) revert InvalidTitle();
        if (
            schedule_.registrationStart >= schedule_.registrationEnd
                || schedule_.registrationEnd >= schedule_.votingStart
                || schedule_.votingStart >= schedule_.votingEnd
        ) revert InvalidSchedule();

        title = title_;
        metadataCid = metadataCid_;
        schedule = schedule_;
        // No external call happens here; the linter misreads this path.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Configured(title_, metadataCid_, schedule_);
    }

    function _setCandidates(Candidate[] calldata candidates_) private {
        uint256 count = candidates_.length;
        if (count == 0 || count > MAX_CANDIDATES) revert InvalidCandidates();

        delete _candidates;
        bool unnamed = false;
        for (uint256 i; i < count; ++i) {
            unnamed = unnamed || bytes(candidates_[i].name).length == 0;
            _candidates.push(candidates_[i]);
        }
        if (unnamed) revert InvalidCandidates();
        // No external call happens here; the linter misreads this path.
        // forge-lint: disable-next-line(reentrancy-events)
        emit CandidatesSet(count);
    }

    function _setPhase(Phase next) private {
        emit PhaseChanged(phase, next);
        phase = next;
    }

    function _requirePhase(Phase expected) private view {
        if (phase != expected) revert WrongPhase(phase);
    }

    function _requireNotBefore(uint64 time) private view {
        if (block.timestamp < time) revert TooEarly(time);
    }

    function _requireBefore(uint64 time) private view {
        if (block.timestamp >= time) revert TooLate(time);
    }

    function _requireBeforeVoting() private view {
        if (phase != Phase.Created && phase != Phase.Registration) revert WrongPhase(phase);
        _requireBefore(schedule.votingStart);
    }

    function _requireCancellable() private view {
        if (phase != Phase.Created && phase != Phase.Registration) revert WrongPhase(phase);
        bool votingWindow =
            block.timestamp >= schedule.votingStart && block.timestamp < schedule.votingEnd;
        if (votingWindow && isVoterListPublished()) revert TooLate(schedule.votingStart);
    }
}

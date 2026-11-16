import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { ConnectorChainMismatchError } from "wagmi";

import { ApiError } from "./api";
import { chain } from "./env";

/** Readable explanations of the contracts' custom errors. */
const CONTRACT_ERRORS: Record<string, string> = {
  WrongPhase: "The election is not in the right phase for that.",
  TooEarly: "It is not time for that step yet.",
  TooLate: "The time for that step has passed.",
  VotingClosed: "Voting has closed.",
  InvalidSchedule:
    "The times must run in order: registration opens, registration closes, voting opens, voting closes.",
  InvalidTitle: "The election needs a title.",
  InvalidCandidates: "List between 1 and 64 candidates, each with a name.",
  VoterListNotPublished: "The voter list has not been published yet.",
  VoterListAlreadyPublished: "The voter list is already published.",
  InvalidVoterList: "The voter list is empty or incomplete.",
  InvalidChoice: "That is not a valid choice of candidates.",
  InvalidProof: "The ballot's proof does not check out against the published voter list.",
  AlreadyVoted: "This wallet has already voted in this election.",
  BallotCapReached: "Every registered voter has already voted.",
  NotEligible: "This wallet is not on the voter list.",
  ZeroAddress: "An address is missing.",
  AccessControlUnauthorizedAccount: "Your wallet is not allowed to do that.",
};

const WRONG_CHAIN = `Your wallet is on another network. Switch it to ${chain.name} and try again.`;

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  // wagmi's own error, not one of viem's, when the wallet is on another network.
  if (error instanceof ConnectorChainMismatchError) return WRONG_CHAIN;
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
      return "The request was rejected in the wallet.";
    }
    if (error.walk((cause) => cause instanceof ChainMismatchError)) return WRONG_CHAIN;
    if (error instanceof WaitForTransactionReceiptTimeoutError) {
      return (
        "The transaction has not been mined yet. It may still go through, so check the page " +
        "again in a few minutes before sending it again."
      );
    }
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      return (name && CONTRACT_ERRORS[name]) ?? reverted.shortMessage;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

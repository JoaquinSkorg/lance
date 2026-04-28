/**
 * bumpFeeService.test.ts
 *
 * Covers all acceptance criteria:
 *  AC-1  Build / simulate / submit with status feedback
 *  AC-2  Sequence-number mismatch retry
 *  AC-3  Dev XDR/simulation logging (spy on console.debug)
 *  AC-4  Dynamic fee & resource adjustment
 *  AC-5  Success triggers result propagation (UI would react to state)
 */

import { BumpFeeService, BumpFeeParams } from "./bumpFeeService";
import { SorobanRpc, Networks } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY =
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
const MOCK_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const MOCK_TX_HASH =
  "6bc97b01e2e9a832b4a0a7e5d4a1234567890abcdef1234567890abcdef123456";

function makeMockServer(
  overrides: Partial<ReturnType<typeof buildMockServer>> = {},
) {
  return { ...buildMockServer(), ...overrides };
}

function buildMockServer() {
  return {
    getAccount: jest.fn().mockResolvedValue({
      accountId: MOCK_PUBLIC_KEY,
      sequence: "1000",
      incrementSequenceNumber: jest.fn(),
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      _parsed: true,
      minResourceFee: "5000",
      transactionData: "AAAA",
      results: [{ auth: [], xdr: "AAAA" }],
      // mark as success shape
      error: undefined,
    }),
    sendTransaction: jest.fn().mockResolvedValue({
      status: "PENDING",
      hash: MOCK_TX_HASH,
    }),
    getTransaction: jest.fn().mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
      ledger: 42,
      resultXdr: { toXDR: () => Buffer.alloc(0), toXDR: (enc: string) => "" },
    }),
  };
}

// Patch SorobanRpc module so we can inject mocks
jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn(),
      assembleTransaction: jest.fn().mockReturnValue({
        build: jest.fn().mockReturnValue({
          toXDR: jest.fn().mockReturnValue("MOCK_ASSEMBLED_XDR"),
        }),
      }),
      Api: {
        ...actual.SorobanRpc.Api,
        isSimulationError: jest.fn().mockReturnValue(false),
        isSimulationSuccess: jest.fn().mockReturnValue(true),
        GetTransactionStatus: actual.SorobanRpc.Api.GetTransactionStatus,
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BumpFeeService", () => {
  let service: BumpFeeService;
  let mockServer: ReturnType<typeof buildMockServer>;
  const mockSignTx = jest.fn().mockResolvedValue("SIGNED_XDR");
  const onStatus = jest.fn();

  const baseParams: BumpFeeParams = {
    contractId: MOCK_CONTRACT_ID,
    functionName: "bump_fee",
    args: ["job_001", BigInt(500_000)],
    sourcePublicKey: MOCK_PUBLIC_KEY,
    feePadding: 10_000,
    maxPollAttempts: 3,
    pollIntervalMs: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = buildMockServer();
    // Inject mock server into constructor
    (SorobanRpc.Server as jest.Mock).mockImplementation(() => mockServer);
    service = new BumpFeeService(
      "https://soroban-testnet.stellar.org",
      Networks.TESTNET,
    );
  });

  // AC-1: build, simulate, submit, poll, status feedback
  it("AC-1: executes full lifecycle and returns success", async () => {
    const result = await service.execute(baseParams, mockSignTx, onStatus);

    expect(result.status).toBe("success");
    expect(result.txHash).toBe(MOCK_TX_HASH);
    expect(result.ledger).toBe(42);

    // Status progression
    const statuses = onStatus.mock.calls.map((c) => c[0]);
    expect(statuses).toEqual(
      expect.arrayContaining([
        "building",
        "simulating",
        "awaiting_signature",
        "submitting",
        "polling",
        "success",
      ]),
    );
  });

  // AC-2: Sequence number mismatch – should refresh and retry once
  it("AC-2: retries account load on sequence mismatch error", async () => {
    mockServer.getAccount
      .mockRejectedValueOnce(new Error("sequence mismatch"))
      .mockResolvedValueOnce({
        accountId: MOCK_PUBLIC_KEY,
        sequence: "1001",
        incrementSequenceNumber: jest.fn(),
      });

    const result = await service.execute(baseParams, mockSignTx, onStatus);

    expect(mockServer.getAccount).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
  });

  // AC-2: After one retry, still fails → surface error
  it("AC-2: surfaces error if account reload also fails", async () => {
    mockServer.getAccount.mockRejectedValue(new Error("sequence mismatch"));

    const result = await service.execute(baseParams, mockSignTx, onStatus);

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/Failed to load account/);
    expect(onStatus).toHaveBeenCalledWith("error", expect.any(String));
  });

  // AC-3: Dev logging – console.debug called in dev mode
  it("AC-3: logs XDR and simulation in development mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const spy = jest.spyOn(console, "debug").mockImplementation(() => {});

    await service.execute(baseParams, mockSignTx);

    expect(spy).toHaveBeenCalledWith(
      "[BumpFeeService]",
      expect.stringContaining("Built TX XDR"),
      expect.any(String),
    );
    expect(spy).toHaveBeenCalledWith(
      "[BumpFeeService]",
      expect.stringContaining("Simulation result"),
      expect.any(String),
    );

    spy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  // AC-4: Fee bumped dynamically based on simulation minResourceFee
  it("AC-4: applies fee padding on top of simulated minResourceFee", async () => {
    // We can observe this indirectly through the fee-bump log in dev
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const spy = jest.spyOn(console, "debug").mockImplementation(() => {});

    await service.execute({ ...baseParams, feePadding: 20_000 }, mockSignTx);

    const feeLog = spy.mock.calls.find((c) =>
      String(c[1]).includes("Fee bump"),
    );
    expect(feeLog).toBeDefined();
    // minResourceFee=5000, padding=20000 → total=25000
    expect(String(feeLog)).toContain("25000");

    spy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  // AC-5: Failed simulation surfaces descriptive error
  it("AC-5: returns error when simulation fails", async () => {
    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValueOnce(true);
    mockServer.simulateTransaction.mockResolvedValueOnce({
      error: "contract trapped",
    });

    const result = await service.execute(baseParams, mockSignTx, onStatus);

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/Simulation failed/);
  });

  // Polling: transaction FAILED on-chain
  it("surfaces error when transaction fails on-chain during polling", async () => {
    mockServer.getTransaction.mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
      resultXdr: { toXDR: (_enc: string) => "FAILED_XDR" },
    });

    const result = await service.execute(baseParams, mockSignTx, onStatus);

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/Transaction failed on-chain/);
  });

  // Polling: timeout
  it("times out after maxPollAttempts with NOT_FOUND", async () => {
    mockServer.getTransaction.mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
    });

    const result = await service.execute(
      { ...baseParams, maxPollAttempts: 2, pollIntervalMs: 1 },
      mockSignTx,
      onStatus,
    );

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/not confirmed after/);
  });
});

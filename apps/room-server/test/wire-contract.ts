export interface WireParts {
  readonly clientFrame: string;
  readonly command: string;
  readonly event: string;
  readonly httpRefusal: string;
  readonly joinRequest: string;
  readonly openRequest: string;
  readonly rejection: string;
  readonly roomPass: string;
  readonly serverFrame: string;
  readonly view: string;
}

export interface WireContract {
  readonly protocol: number;
  readonly parts: WireParts;
}

export const WIRE_CONTRACTS: readonly WireContract[] = [
  {
    parts: {
      clientFrame: "202218e9fe5fbb59",
      command: "05066162c21d1b50",
      event: "98a26fa9fa6a40c5",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "6220e40293a98c66",
      rejection: "812a1dc081af9b77",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "9977cff46d1cc62c",
      view: "7aa7d54082062d0e",
    },
    protocol: 1,
  },
  {
    parts: {
      clientFrame: "202218e9fe5fbb59",
      command: "05066162c21d1b50",
      event: "b7cb19ec4712f2ec",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "6220e40293a98c66",
      rejection: "53c214fab7fb14ac",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "dc439d0028cf406f",
      view: "1191fac659f9cb15",
    },
    protocol: 2,
  },
];

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
  readonly standings?: string;
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
  {
    parts: {
      clientFrame: "9a21edb1305fb57d",
      command: "57ca3e799a76c1c1",
      event: "7022790fd9f08116",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "67a9456b9e8dc328",
      rejection: "53c214fab7fb14ac",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "f2d87530d2a1e94b",
      view: "4dd4f28120985807",
    },
    protocol: 3,
  },
  {
    parts: {
      clientFrame: "3cf1e1e82a847e4b",
      command: "57ca3e799a76c1c1",
      event: "7022790fd9f08116",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "67a9456b9e8dc328",
      rejection: "53c214fab7fb14ac",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "41decf9703c017c4",
      view: "4dd4f28120985807",
    },
    protocol: 4,
  },
  {
    parts: {
      clientFrame: "66af7fab66cd255f",
      command: "b3c1b020dfe7c408",
      event: "7b9d2342afb6b60e",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "69f761f291e268b4",
      rejection: "6febb99ccd60b782",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "dc3a338bd363d833",
      view: "acb4415c5b19d974",
    },
    protocol: 5,
  },
  {
    parts: {
      clientFrame: "66af7fab66cd255f",
      command: "b3c1b020dfe7c408",
      event: "e560414e45ef1638",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "69f761f291e268b4",
      rejection: "6febb99ccd60b782",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "23165e8df8fb9515",
      view: "f45c6bcef4fe49ca",
    },
    protocol: 6,
  },
  {
    parts: {
      clientFrame: "66af7fab66cd255f",
      command: "b3c1b020dfe7c408",
      event: "221c30e73c1d233a",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "69f761f291e268b4",
      rejection: "6febb99ccd60b782",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "68da598753cee18d",
      view: "2f2103fd804ee303",
    },
    protocol: 7,
  },
  {
    parts: {
      clientFrame: "e53b88e7f0b05c7b",
      command: "e3e3df485ffbb725",
      event: "dae086d1204ee5d0",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "69f761f291e268b4",
      rejection: "7411ec2defa3f355",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "f138bb8dd5264985",
      view: "5c2ec84c4e9a3a87",
    },
    protocol: 8,
  },
  {
    parts: {
      clientFrame: "97f550d699597c8c",
      command: "d1025ce4a76342b8",
      event: "615fc6b0ebc4d801",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "23411545d25c11b1",
      rejection: "7411ec2defa3f355",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "c3aae34705917b71",
      view: "40207e0c643e2200",
    },
    protocol: 9,
  },
  {
    parts: {
      clientFrame: "97f550d699597c8c",
      command: "d1025ce4a76342b8",
      event: "615fc6b0ebc4d801",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "23411545d25c11b1",
      rejection: "7411ec2defa3f355",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "54fb4583bfad3ed6",
      view: "292ee62cd0ddb145",
    },
    protocol: 10,
  },
  {
    parts: {
      clientFrame: "97f550d699597c8c",
      command: "d1025ce4a76342b8",
      event: "615fc6b0ebc4d801",
      httpRefusal: "10824b43355182f8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "23411545d25c11b1",
      rejection: "7411ec2defa3f355",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "8ebab4b414893dbf",
      view: "292ee62cd0ddb145",
    },
    protocol: 11,
  },
  {
    parts: {
      clientFrame: "97f550d699597c8c",
      command: "d1025ce4a76342b8",
      event: "615fc6b0ebc4d801",
      httpRefusal: "201bc8c0ad84f4a8",
      joinRequest: "667f37fb5b4e462f",
      openRequest: "23411545d25c11b1",
      rejection: "7411ec2defa3f355",
      roomPass: "c10081ecd072b4b7",
      serverFrame: "8ebab4b414893dbf",
      standings: "190eba36406d86a9",
      view: "292ee62cd0ddb145",
    },
    protocol: 12,
  },
];

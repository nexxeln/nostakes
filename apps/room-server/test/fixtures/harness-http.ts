import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";

export const harnessHttp = NodeHttpClient.layerUndiciOptions({
  pipelining: 0,
});

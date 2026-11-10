import { Http, Runtime } from "foldkit";

import { FlagsSchema, ModelSchema } from "../features/model.js";
import { init, update } from "../features/update.js";
import { view } from "../features/view.js";
import { managedResources } from "./connection.js";
import { readFlags } from "./storage.js";
import { subscriptions } from "./subscriptions.js";
import { defineTable } from "./table/element.js";

import "./tokens.css";
import "./app.css";

defineTable();

const application = Runtime.makeApplication({
  Flags: FlagsSchema,
  Model: ModelSchema,
  container: document.querySelector("#root"),
  init,
  managedResources,
  resources: Http.layer,
  subscriptions,
  update,
  view,
});

Runtime.run(application, { flags: readFlags });

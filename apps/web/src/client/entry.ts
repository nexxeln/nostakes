import { Runtime } from "foldkit";

import { ModelSchema, init, update, view } from "../features/app.js";

import "./tokens.css";
import "./app.css";

const application = Runtime.makeApplication({
  Model: ModelSchema,
  container: document.querySelector("#root"),
  init,
  update,
  view,
});

Runtime.run(application);

// Brain Matrix — re-exports router.js as matrix.js per spec file structure
// The Matrix determines which tables/operations each message relates to
// and only reads the necessary data (no overfetch)

export { Router, routeIntent, initializeRouter } from "./router.js";
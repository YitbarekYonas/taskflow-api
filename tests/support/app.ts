import request from "supertest";
import { createApp } from "../../src/app.js";

// One app per test file. Supertest starts a throwaway server per request, so no port is used.
export const app = createApp();
export const api = () => request(app);

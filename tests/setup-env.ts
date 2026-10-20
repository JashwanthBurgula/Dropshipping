import { assertTestSafetyIsolation } from "../src/lib/test-isolation";

process.env.EMAIL_PROVIDER = "console";
assertTestSafetyIsolation(process.env);

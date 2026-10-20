import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { prisma } from "../../src/lib/db";
import {
  createServerSession,
  CUSTOMER_SESSION_COOKIE,
  setInjectedCookieAdapterForTests,
  getSessionByRawToken,
} from "../../src/lib/auth/session";
import { hashPassword, verifyPassword } from "../../src/lib/auth/password";
import {
  createSignedCsrfToken,
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
} from "../../src/lib/csrf";
import {
  GET as getProfile,
  PATCH as patchProfile,
} from "../../src/app/api/account/profile/route";
import {
  GET as getAddresses,
  POST as createAddress,
} from "../../src/app/api/account/addresses/route";
import {
  PATCH as updateAddress,
  DELETE as deleteAddress,
} from "../../src/app/api/account/addresses/[id]/route";
import { POST as changePassword } from "../../src/app/api/account/change-password/route";
import { GET as exportData } from "../../src/app/api/account/export-data/route";
import { POST as deleteAccount } from "../../src/app/api/account/delete/route";

describe("Account Profile & Privacy Integration Tests", () => {
  const testCookieStore = new Map<string, { value: string; options: any }>();

  beforeEach(() => {
    testCookieStore.clear();
    setInjectedCookieAdapterForTests({
      get: (name) => {
        const item = testCookieStore.get(name);
        return item ? { value: item.value } : undefined;
      },
      set: (name, value, options) => {
        testCookieStore.set(name, { value, options });
      },
    });
  });

  afterEach(() => {
    setInjectedCookieAdapterForTests(null);
  });

  async function createTestCustomer(prefix: string) {
    const timestamp = Date.now();
    const email = `${prefix}_${timestamp}@test.example.com`;
    const passwordHash = await hashPassword("ValidPassword123#");

    const user = await prisma.user.create({
      data: {
        email,
        canonicalEmail: email,
        fullName: `${prefix} Customer`,
        phone: "9876543210",
        passwordHash,
        isVerified: true,
        addressLine: "123 Indiranagar 100ft Road",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560038",
      },
    });

    const session = await createServerSession({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: "CUSTOMER",
    });

    return { user, session };
  }

  function makeAuthHeaders(rawToken: string, csrfToken: string) {
    return {
      "Content-Type": "application/json",
      [CSRF_HEADER_NAME]: csrfToken,
      cookie: `${CSRF_COOKIE_NAME}=${csrfToken}; ${CUSTOMER_SESSION_COOKIE}=${rawToken}`,
    };
  }

  it("enforces strict cross-user data isolation (User A cannot access or mutate User B data)", async () => {
    const userA = await createTestCustomer("isolation_a");
    const userB = await createTestCustomer("isolation_b");
    const csrfToken = createSignedCsrfToken();

    // User B creates a saved address
    const bAddress = await prisma.savedAddress.create({
      data: {
        userId: userB.user.id,
        label: "User B Home",
        recipientName: "User B",
        phone: "9876543211",
        addressLine: "456 Koramangala 4th Block",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560034",
        isDefault: true,
      },
    });

    // 1. User A requests their own profile
    const profileReqA = new Request("http://localhost:3000/api/account/profile", {
      method: "GET",
      headers: makeAuthHeaders(userA.session.rawToken, csrfToken),
    });
    const profileResA = await getProfile(profileReqA);
    expect(profileResA.status).toBe(200);
    const profileDataA = await profileResA.json();
    expect(profileDataA.user.id).toBe(userA.user.id);
    expect(profileDataA.user.email).toBe(userA.user.email);
    expect(profileDataA.user.savedAddresses).toEqual([]);

    // 2. User A attempts to update User B's saved address
    const updateReq = new Request(
      `http://localhost:3000/api/account/addresses/${bAddress.id}`,
      {
        method: "PATCH",
        headers: makeAuthHeaders(userA.session.rawToken, csrfToken),
        body: JSON.stringify({ label: "Hacked Label" }),
      }
    );
    const updateRes = await updateAddress(updateReq, {
      params: Promise.resolve({ id: bAddress.id }),
    });
    expect(updateRes.status).toBe(404);

    // Verify User B's address was NOT modified
    const unchanged = await prisma.savedAddress.findUnique({
      where: { id: bAddress.id },
    });
    expect(unchanged?.label).toBe("User B Home");

    // 3. User A attempts to delete User B's saved address
    const deleteReq = new Request(
      `http://localhost:3000/api/account/addresses/${bAddress.id}`,
      {
        method: "DELETE",
        headers: makeAuthHeaders(userA.session.rawToken, csrfToken),
      }
    );
    const deleteRes = await deleteAddress(deleteReq, {
      params: Promise.resolve({ id: bAddress.id }),
    });
    expect(deleteRes.status).toBe(404);

    // Verify User B's address still exists
    const stillExists = await prisma.savedAddress.findUnique({
      where: { id: bAddress.id },
    });
    expect(stillExists).not.toBeNull();
  });

  it("persists valid profile updates and validates phone and name requirements", async () => {
    const { user, session } = await createTestCustomer("profile_edit");
    const csrfToken = createSignedCsrfToken();

    // 1. Attempt invalid update (short name, invalid phone)
    const invalidReq = new Request("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
      body: JSON.stringify({
        fullName: "A",
        phone: "12345",
      }),
    });
    const invalidRes = await patchProfile(invalidReq);
    expect(invalidRes.status).toBe(400);
    const invalidData = await invalidRes.json();
    expect(invalidData.fieldErrors).toBeDefined();
    expect(invalidData.fieldErrors.fullName).toBeDefined();
    expect(invalidData.fieldErrors.phone).toBeDefined();

    // 2. Perform valid update
    const validReq = new Request("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
      body: JSON.stringify({
        fullName: "Updated Full Name",
        phone: "9123456780",
        addressLine: "789 Brigade Road",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560025",
      }),
    });
    const validRes = await patchProfile(validReq);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.ok).toBe(true);
    expect(validData.user.fullName).toBe("Updated Full Name");
    expect(validData.user.phone).toBe("9123456780");

    // 3. Confirm persistence via GET
    const getReq = new Request("http://localhost:3000/api/account/profile", {
      method: "GET",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
    });
    const getRes = await getProfile(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.user.fullName).toBe("Updated Full Name");
    expect(getData.user.addressLine).toBe("789 Brigade Road");
    expect(getData.user.pinCode).toBe("560025");
  });

  it("handles saved address CRUD operations and enforces single default address", async () => {
    const { session } = await createTestCustomer("address_crud");
    const csrfToken = createSignedCsrfToken();

    // 1. Create first address as default
    const createReq1 = new Request("http://localhost:3000/api/account/addresses", {
      method: "POST",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
      body: JSON.stringify({
        label: "Home",
        recipientName: "Test User",
        phone: "9876543210",
        addressLine: "Flat 101, Green Heights",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560038",
        isDefault: true,
      }),
    });
    const createRes1 = await createAddress(createReq1);
    expect(createRes1.status).toBe(201);
    const addr1Data = await createRes1.json();
    expect(addr1Data.ok).toBe(true);
    expect(addr1Data.address.isDefault).toBe(true);
    const addr1Id = addr1Data.address.id;

    // 2. Create second address also marked as default
    const createReq2 = new Request("http://localhost:3000/api/account/addresses", {
      method: "POST",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
      body: JSON.stringify({
        label: "Office",
        recipientName: "Test User Work",
        phone: "9876543210",
        addressLine: "Tech Park, Whitefield",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560066",
        isDefault: true,
      }),
    });
    const createRes2 = await createAddress(createReq2);
    expect(createRes2.status).toBe(201);
    const addr2Data = await createRes2.json();
    expect(addr2Data.address.isDefault).toBe(true);
    const addr2Id = addr2Data.address.id;

    // 3. Query all addresses: addr2 should be default, addr1 should NOT be default
    const listReq = new Request("http://localhost:3000/api/account/addresses", {
      method: "GET",
      headers: makeAuthHeaders(session.rawToken, csrfToken),
    });
    const listRes = await getAddresses(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.addresses.length).toBe(2);
    const found1 = listData.addresses.find((a: any) => a.id === addr1Id);
    const found2 = listData.addresses.find((a: any) => a.id === addr2Id);
    expect(found2.isDefault).toBe(true);
    expect(found1.isDefault).toBe(false);

    // 4. Delete addr1
    const delReq = new Request(
      `http://localhost:3000/api/account/addresses/${addr1Id}`,
      {
        method: "DELETE",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
      }
    );
    const delRes = await deleteAddress(delReq, {
      params: Promise.resolve({ id: addr1Id }),
    });
    expect(delRes.status).toBe(200);

    // Verify only 1 address remains
    const finalListRes = await getAddresses(listReq);
    const finalList = await finalListRes.json();
    expect(finalList.addresses.length).toBe(1);
    expect(finalList.addresses[0].id).toBe(addr2Id);
  });

  it("verifies change password checks current password, breaches, and revokes sessions", async () => {
    const { user, session } = await createTestCustomer("pwd_change");
    const csrfToken = createSignedCsrfToken();

    // 1. Wrong current password fails
    const wrongCurrentReq = new Request(
      "http://localhost:3000/api/account/change-password",
      {
        method: "POST",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
        body: JSON.stringify({
          currentPassword: "WrongPassword999!",
          newPassword: "NewSecretPassword2026#",
          confirmPassword: "NewSecretPassword2026#",
        }),
      }
    );
    const wrongRes = await changePassword(wrongCurrentReq);
    expect(wrongRes.status).toBe(400);
    const wrongData = await wrongRes.json();
    expect(wrongData.error).toContain("current password is incorrect");

    // 2. Breached password fails
    const breachedReq = new Request(
      "http://localhost:3000/api/account/change-password",
      {
        method: "POST",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
        body: JSON.stringify({
          currentPassword: "ValidPassword123#",
          newPassword: "Password123!",
          confirmPassword: "Password123!",
        }),
      }
    );
    const breachedRes = await changePassword(breachedReq);
    expect(breachedRes.status).toBe(400);

    // 3. Valid change succeeds
    const validPwdReq = new Request(
      "http://localhost:3000/api/account/change-password",
      {
        method: "POST",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
        body: JSON.stringify({
          currentPassword: "ValidPassword123#",
          newPassword: "BrandNewSecurePassword2026#",
          confirmPassword: "BrandNewSecurePassword2026#",
        }),
      }
    );
    const validPwdRes = await changePassword(validPwdReq);
    expect(validPwdRes.status).toBe(200);

    // 4. Verify password hash updated in DB
    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    const matchNew = await verifyPassword(
      refreshedUser!.passwordHash,
      "BrandNewSecurePassword2026#"
    );
    expect(matchNew).toBe(true);

    const matchOld = await verifyPassword(
      refreshedUser!.passwordHash,
      "ValidPassword123#"
    );
    expect(matchOld).toBe(false);

    // 5. Old session token revoked in Redis
    const oldSession = await getSessionByRawToken(session.rawToken);
    expect(oldSession).toBeNull();
  });

  it("exports customer personal data in clean DPDP/GDPR compliant JSON without passwords or secrets", async () => {
    const { user, session } = await createTestCustomer("data_export");
    const csrfToken = createSignedCsrfToken();

    const exportReq = new Request(
      "http://localhost:3000/api/account/export-data",
      {
        method: "GET",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
      }
    );
    const exportRes = await exportData(exportReq);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("content-type")).toContain("application/json");
    expect(exportRes.headers.get("content-disposition")).toContain("attachment; filename=");

    const exportText = await exportRes.text();
    const exportJson = JSON.parse(exportText);

    expect(exportJson.user.id).toBe(user.id);
    expect(exportJson.user.email).toBe(user.email);
    expect(exportJson.user.fullName).toBe(user.fullName);

    // Crucial security check: passwordHash, salt, pepper, or tokens must NOT be present
    expect(exportText).not.toContain("passwordHash");
    expect(exportText).not.toContain("argon2");
    expect(exportJson.user.passwordHash).toBeUndefined();
  });

  it("executes account deletion, records audit log, anonymizes data, and revokes sessions", async () => {
    const { user, session } = await createTestCustomer("account_delete");
    const csrfToken = createSignedCsrfToken();

    // 1. Wrong password rejected
    const wrongDelReq = new Request(
      "http://localhost:3000/api/account/delete",
      {
        method: "POST",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
        body: JSON.stringify({ password: "WrongPassword!" }),
      }
    );
    const wrongDelRes = await deleteAccount(wrongDelReq);
    expect(wrongDelRes.status).toBe(400);

    // 2. Correct password confirmed
    const validDelReq = new Request(
      "http://localhost:3000/api/account/delete",
      {
        method: "POST",
        headers: makeAuthHeaders(session.rawToken, csrfToken),
        body: JSON.stringify({ password: "ValidPassword123#" }),
      }
    );
    const validDelRes = await deleteAccount(validDelReq);
    expect(validDelRes.status).toBe(200);

    // 3. Audit log recorded
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        targetType: "USER",
        targetId: user.id,
        action: "ACCOUNT_DELETED",
      },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0]!.action).toBe("ACCOUNT_DELETED");

    // 4. User data is anonymized
    const anonymizedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(anonymizedUser).not.toBeNull();
    expect(anonymizedUser!.fullName).toBe("Deleted Customer");
    expect(anonymizedUser!.email).toContain("@deleted.invalid");
    expect(anonymizedUser!.phone).toBe("0000000000");

    // 5. Session is revoked
    const deletedSession = await getSessionByRawToken(session.rawToken);
    expect(deletedSession).toBeNull();
  });
});

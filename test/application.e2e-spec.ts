import { AddressInfo } from "node:net";
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.module";
import { PrescriptionProcessingService } from "../src/prescription-processing/prescription-processing.service";

type TestUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: "PATIENT";
  isActive: boolean;
  createdAt: Date;
};

type TestMedication = {
  id: string;
  ownerId: string;
  name: string;
  dosage: string;
  instructions?: string;
  startDate: Date;
  endDate?: Date;
  status: string;
  prescribingClinician?: string;
  reminders: unknown[];
};

function createPrismaStub() {
  const users = new Map<string, TestUser>();
  const profiles = new Map<string, Record<string, unknown>>();
  const medications = new Map<string, TestMedication>();
  let nextId = 0;
  const newId = (prefix: string) => `${prefix}-synthetic-${++nextId}`;

  const prisma = {
    user: {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) =>
        [...users.values()].find(
          (user) =>
            (where.email !== undefined && user.email === where.email) ||
            (where.id !== undefined && user.id === where.id),
        ) ?? null,
      create: async ({
        data,
      }: {
        data: { email: string; passwordHash: string };
      }) => {
        const user: TestUser = {
          id: newId("user"),
          email: data.email,
          passwordHash: data.passwordHash,
          role: "PATIENT",
          isActive: true,
          createdAt: new Date(),
        };
        users.set(user.id, user);
        profiles.set(user.id, {
          id: newId("profile"),
          userId: user.id,
          preferredLanguage: "fr",
          timezone: "Africa/Casablanca",
        });
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        };
      },
    },
    patientProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        profiles.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const current = profiles.get(where.userId) ?? {
          id: newId("profile"),
          userId: where.userId,
        };
        const updated = { ...current };
        for (const [key, value] of Object.entries(
          profiles.has(where.userId) ? update : create,
        )) {
          if (value !== undefined) updated[key] = value;
        }
        profiles.set(where.userId, updated);
        return updated;
      },
    },
    medication: {
      findMany: async ({ where }: { where: { ownerId: string } }) =>
        [...medications.values()]
          .filter((medication) => medication.ownerId === where.ownerId)
          .map((medication) => ({ ...medication })),
      create: async ({
        data,
      }: {
        data: Omit<TestMedication, "id" | "reminders" | "status">;
      }) => {
        const medication: TestMedication = {
          ...data,
          id: newId("medication"),
          status: "ACTIVE",
          reminders: [],
        };
        medications.set(medication.id, medication);
        return { ...medication };
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; ownerId: string };
      }) => {
        const medication = medications.get(where.id);
        return medication?.ownerId === where.ownerId ? { ...medication } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const medication = medications.get(where.id);
        if (!medication) throw new Error("Test medication missing");
        const updated = { ...medication, ...data };
        medications.set(updated.id, updated);
        return { ...updated };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const medication = medications.get(where.id);
        if (!medication) throw new Error("Test medication missing");
        medications.delete(where.id);
        return { ...medication };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: newId("audit"),
        ...data,
      }),
    },
  };

  return {
    prisma,
    reset: () => {
      users.clear();
      profiles.clear();
      medications.clear();
      nextId = 0;
    },
  };
}

function createPrescriptionStub() {
  const records = new Map<
    string,
    { ownerId: string; documentId: string; status: string; candidate: object }
  >();
  const key = (ownerId: string, documentId: string) =>
    `${ownerId}:${documentId}`;

  const processing = {
    getExtraction: async (ownerId: string, documentId: string) => {
      const record = records.get(key(ownerId, documentId));
      if (!record) throw new NotFoundException("Prescription not found");
      return { ...record };
    },
    reviewExtraction: async (
      ownerId: string,
      documentId: string,
      patch: Record<string, unknown>,
    ) => {
      const record = records.get(key(ownerId, documentId));
      if (!record) throw new NotFoundException("Prescription not found");
      record.candidate = { ...record.candidate, ...patch };
      return { ...record };
    },
    confirmExtraction: async (
      ownerId: string,
      documentId: string,
      confirmation: object,
    ) => {
      const record = records.get(key(ownerId, documentId));
      if (!record) throw new NotFoundException("Prescription not found");
      record.status = "confirmed";
      return { ...record, confirmation };
    },
    rejectExtraction: async (
      ownerId: string,
      documentId: string,
      reason?: string,
    ) => {
      const record = records.get(key(ownerId, documentId));
      if (!record) throw new NotFoundException("Prescription not found");
      record.status = "rejected";
      return { ...record, reason };
    },
  };

  return {
    processing,
    reset: () => records.clear(),
    seed: (ownerId: string, documentId: string) => {
      records.set(key(ownerId, documentId), {
        ownerId,
        documentId,
        status: "needs_review",
        candidate: {
          prescriptionDate: { value: "2026-01-15" },
          medications: [{ name: { value: "Synthetic medicine" } }],
          reviewRequired: true,
        },
      });
    },
  };
}

describe("Application E2E", () => {
  let app: INestApplication;
  let baseUrl: string;
  const db = createPrismaStub();
  const prescriptions = createPrescriptionStub();

  async function request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/v1${path}`, options);
  }

  async function register(email: string) {
    const response = await request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "Synthetic-Password-123!",
      }),
    });
    return { response, body: await response.json() };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(db.prisma)
      .overrideProvider(PrescriptionProcessingService)
      .useValue(prescriptions.processing)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    db.reset();
    prescriptions.reset();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("registration and login", () => {
    it("registers a synthetic account, normalizes email, and permits login", async () => {
      const { response, body } = await register("Patient@Test.Example");
      expect(response.status).toBe(201);
      expect(body.user.email).toBe("patient@test.example");
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).not.toHaveProperty("passwordHash");

      const login = await request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "PATIENT@test.example",
          password: "Synthetic-Password-123!",
        }),
      });
      expect(login.status).toBe(201);
      expect((await login.json()).user.email).toBe("patient@test.example");
    });

    it("rejects duplicate accounts, invalid credentials, and invalid registration input", async () => {
      await register("duplicate@test.example");
      const duplicate = await register("DUPLICATE@test.example");
      expect(duplicate.response.status).toBe(409);

      const invalidLogin = await request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "duplicate@test.example",
          password: "incorrect",
        }),
      });
      expect(invalidLogin.status).toBe(401);

      const invalidRegistration = await request("/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "short" }),
      });
      expect(invalidRegistration.status).toBe(400);
    });
  });

  describe("profile management", () => {
    it("requires authentication and reads/updates only the authenticated profile", async () => {
      const first = await register("profile-one@test.example");
      const second = await register("profile-two@test.example");
      const firstToken = first.body.accessToken as string;
      const secondToken = second.body.accessToken as string;

      expect((await request("/profile")).status).toBe(401);

      const initial = await request("/profile", {
        headers: { authorization: `Bearer ${firstToken}` },
      });
      expect(initial.status).toBe(200);
      expect(await initial.json()).toMatchObject({
        preferredLanguage: "fr",
        timezone: "Africa/Casablanca",
      });

      const update = await request("/profile", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${firstToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Synthetic",
          lastName: "Patient",
          preferredLanguage: "en",
        }),
      });
      expect(update.status).toBe(200);
      expect(await update.json()).toMatchObject({
        firstName: "Synthetic",
        lastName: "Patient",
        preferredLanguage: "en",
      });

      const otherProfile = await request("/profile", {
        headers: { authorization: `Bearer ${secondToken}` },
      });
      expect(await otherProfile.json()).not.toMatchObject({
        firstName: "Synthetic",
        lastName: "Patient",
      });

      const otherUpdate = await request("/profile", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${secondToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ firstName: "Unauthorized change" }),
      });
      expect(otherUpdate.status).toBe(200);

      const firstProfileAfterOtherUpdate = await request("/profile", {
        headers: { authorization: `Bearer ${firstToken}` },
      });
      expect(await firstProfileAfterOtherUpdate.json()).toMatchObject({
        firstName: "Synthetic",
        lastName: "Patient",
      });
    });

    it("rejects invalid profile fields", async () => {
      const { body } = await register("invalid-profile@test.example");
      const response = await request("/profile", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${body.accessToken as string}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ firstName: "x".repeat(81) }),
      });
      expect(response.status).toBe(400);

      const unchanged = await request("/profile", {
        headers: { authorization: `Bearer ${body.accessToken as string}` },
      });
      expect(await unchanged.json()).not.toHaveProperty("firstName");
    });
  });

  describe("patient-managed medication plan", () => {
    it("creates, lists, updates, and deletes only the authenticated patient's records", async () => {
      const first = await register("medication-one@test.example");
      const second = await register("medication-two@test.example");
      const firstToken = first.body.accessToken as string;
      const secondToken = second.body.accessToken as string;
      const auth = { authorization: `Bearer ${firstToken}` };

      const create = await request("/medications", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Synthetic medicine",
          dosage: "1 tablet",
          instructions: "Synthetic test instruction",
          startDate: "2026-01-15T00:00:00.000Z",
        }),
      });
      expect(create.status).toBe(201);
      const medication = await create.json();
      expect(medication).toMatchObject({
        name: "Synthetic medicine",
        dosage: "1 tablet",
        status: "ACTIVE",
      });
      expect(medication.ownerId).toBe(first.body.user.id);

      const secondList = await request("/medications", {
        headers: { authorization: `Bearer ${secondToken}` },
      });
      expect(await secondList.json()).toEqual([]);

      const update = await request(`/medications/${medication.id}`, {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      expect(update.status).toBe(200);
      expect(await update.json()).toMatchObject({ status: "PAUSED" });

      const crossOwnerUpdate = await request(`/medications/${medication.id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${secondToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      expect(crossOwnerUpdate.status).toBe(400);

      const crossOwnerDelete = await request(`/medications/${medication.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${secondToken}` },
      });
      expect(crossOwnerDelete.status).toBe(400);

      const ownerListAfterAttack = await request("/medications", {
        headers: auth,
      });
      expect(await ownerListAfterAttack.json()).toMatchObject([
        { id: medication.id, status: "PAUSED" },
      ]);

      const remove = await request(`/medications/${medication.id}`, {
        method: "DELETE",
        headers: auth,
      });
      expect(remove.status).toBe(200);
      expect(await remove.json()).toEqual({ deleted: true });
    });

    it("rejects unauthenticated and invalid medication requests", async () => {
      expect((await request("/medications")).status).toBe(401);
      const { body } = await register("invalid-medication@test.example");
      const response = await request("/medications", {
        method: "POST",
        headers: {
          authorization: `Bearer ${body.accessToken as string}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Synthetic medicine",
          dosage: "1 tablet",
        }),
      });
      expect(response.status).toBe(400);

      const ownerSpoof = await request("/medications", {
        method: "POST",
        headers: {
          authorization: `Bearer ${body.accessToken as string}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ownerId: "another-synthetic-owner",
          name: "Synthetic medicine",
          dosage: "1 tablet",
          startDate: "2026-01-15T00:00:00.000Z",
        }),
      });
      expect(ownerSpoof.status).toBe(400);

      const unchanged = await request("/medications", {
        headers: { authorization: `Bearer ${body.accessToken as string}` },
      });
      expect(await unchanged.json()).toEqual([]);
    });
  });

  describe("prescription review lifecycle", () => {
    it("supports reading, editing, confirming, and rejecting synthetic candidates", async () => {
      const { body } = await register("prescription@test.example");
      const ownerId = body.user.id as string;
      const token = body.accessToken as string;
      const documentId = "document-synthetic-1";
      prescriptions.seed(ownerId, documentId);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };

      const initial = await request(`/prescriptions/${documentId}/extraction`, {
        headers,
      });
      expect(initial.status).toBe(200);
      expect(await initial.json()).toMatchObject({
        status: "needs_review",
        candidate: { reviewRequired: true },
      });

      const review = await request(`/prescriptions/${documentId}/extraction`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          prescriptionDate: { value: "2026-01-20" },
        }),
      });
      expect(review.status).toBe(200);
      expect(await review.json()).toMatchObject({
        candidate: { prescriptionDate: { value: "2026-01-20" } },
      });

      const confirmation = await request(
        `/prescriptions/${documentId}/confirm`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            prescriptionDate: { value: "2026-01-20" },
          }),
        },
      );
      expect(confirmation.status).toBe(201);
      expect(await confirmation.json()).toMatchObject({
        status: "confirmed",
      });

      const rejectDocumentId = "document-synthetic-2";
      prescriptions.seed(ownerId, rejectDocumentId);
      const rejection = await request(
        `/prescriptions/${rejectDocumentId}/reject`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ reason: "Synthetic test rejection" }),
        },
      );
      expect(rejection.status).toBe(201);
      expect(await rejection.json()).toMatchObject({
        status: "rejected",
        reason: "Synthetic test rejection",
      });
    });

    it("requires authentication, enforces ownership, and validates candidate input", async () => {
      const first = await register("prescription-owner@test.example");
      const second = await register("prescription-other@test.example");
      const documentId = "document-owned-by-first";
      prescriptions.seed(first.body.user.id as string, documentId);

      expect(
        (await request(`/prescriptions/${documentId}/extraction`)).status,
      ).toBe(401);

      const otherOwner = await request(
        `/prescriptions/${documentId}/extraction`,
        {
          headers: {
            authorization: `Bearer ${second.body.accessToken as string}`,
          },
        },
      );
      expect(otherOwner.status).toBe(404);

      const secondAuth = {
        authorization: `Bearer ${second.body.accessToken as string}`,
        "content-type": "application/json",
      };
      const crossOwnerReview = await request(
        `/prescriptions/${documentId}/extraction`,
        {
          method: "PATCH",
          headers: secondAuth,
          body: JSON.stringify({
            prescriptionDate: { value: "2026-01-20" },
          }),
        },
      );
      expect(crossOwnerReview.status).toBe(404);

      const crossOwnerConfirmation = await request(
        `/prescriptions/${documentId}/confirm`,
        {
          method: "POST",
          headers: secondAuth,
          body: JSON.stringify({
            prescriptionDate: { value: "2026-01-20" },
          }),
        },
      );
      expect(crossOwnerConfirmation.status).toBe(404);

      const crossOwnerRejection = await request(
        `/prescriptions/${documentId}/reject`,
        {
          method: "POST",
          headers: secondAuth,
          body: JSON.stringify({ reason: "Synthetic unauthorized attempt" }),
        },
      );
      expect(crossOwnerRejection.status).toBe(404);

      const unchanged = await request(
        `/prescriptions/${documentId}/extraction`,
        {
          headers: {
            authorization: `Bearer ${first.body.accessToken as string}`,
          },
        },
      );
      expect(await unchanged.json()).toMatchObject({
        status: "needs_review",
        candidate: { prescriptionDate: { value: "2026-01-15" } },
      });

      const invalidReview = await request(
        `/prescriptions/${documentId}/extraction`,
        {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${first.body.accessToken as string}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            medications: [{ name: { confidence: 2 } }],
          }),
        },
      );
      expect(invalidReview.status).toBe(400);
    });
  });
});

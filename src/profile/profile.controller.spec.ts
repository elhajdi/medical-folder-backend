import { AuditService } from "../audit/audit.module";
import { PrismaService } from "../prisma/prisma.module";
import { ProfileController } from "./profile.controller";

describe("ProfileController", () => {
  it("persists first and last names for the authenticated owner", async () => {
    const profile = { id: "profile-1" };
    const prisma = {
      patientProfile: {
        upsert: jest.fn().mockResolvedValue(profile),
      },
    } as unknown as PrismaService;
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const controller = new ProfileController(prisma, audit);

    await controller.update(
      { user: { id: "synthetic-owner" } },
      {
        firstName: "Synthetic",
        lastName: "Example",
        preferredLanguage: "en",
      },
    );

    expect(prisma.patientProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "synthetic-owner" },
        create: expect.objectContaining({
          userId: "synthetic-owner",
          firstName: "Synthetic",
          lastName: "Example",
          preferredLanguage: "en",
        }),
        update: expect.objectContaining({
          firstName: "Synthetic",
          lastName: "Example",
          preferredLanguage: "en",
        }),
      }),
    );
  });
});

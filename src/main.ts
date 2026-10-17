import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Morocco Patient Health Record API")
    .setDescription(
      "Prototype API. Never use real patient data until security and legal reviews are complete.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  await app.listen(process.env.PORT || 3000);
}
bootstrap();

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./module.js";

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
};

void bootstrap();

import app from "./app";
import { envVars } from "./app/config/env";
import { seedSuperAdmin } from "./app/utils/seed";

const bootstrap = async () => {
  try {
    await seedSuperAdmin();
    app.listen(envVars.PORT, () => {
      console.log(`Server running at http://localhost:${envVars.PORT}`);
    });
  } catch {
    console.error("Something happen in server");
  }
};
bootstrap();

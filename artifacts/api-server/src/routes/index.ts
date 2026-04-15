import { Router, type IRouter } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(membersRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);

export default router;

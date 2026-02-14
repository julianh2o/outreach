import { Router } from 'express';
import contactsRouter from './contacts';
import contactsCsvRouter from './contacts-csv';
import lookupsRouter from './lookups';
import messagesRouter from './messages';
import attachmentsRouter from './attachments';
import downloadsRouter from './downloads';
import healthRouter from './health';

const router = Router();

router.use('/contacts', contactsRouter);
router.use('/contacts/csv', contactsCsvRouter);
router.use('/lookups', lookupsRouter);
router.use('/messages', messagesRouter);
router.use('/attachments', attachmentsRouter);
router.use('/downloads', downloadsRouter);
router.use('/health', healthRouter);

export default router;

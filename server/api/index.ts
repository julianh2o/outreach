import { Router } from 'express';
import contactsRouter from './contacts';
import contactsCsvRouter from './contacts-csv';
import lookupsRouter from './lookups';
import messagesRouter from './messages';
import attachmentsRouter from './attachments';

const router = Router();

router.use('/contacts', contactsRouter);
router.use('/contacts/csv', contactsCsvRouter);
router.use('/lookups', lookupsRouter);
router.use('/messages', messagesRouter);
router.use('/attachments', attachmentsRouter);

export default router;

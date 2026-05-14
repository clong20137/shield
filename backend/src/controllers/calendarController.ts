import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';

export class CalendarController {
  static async listEntries(req: Request, res: Response) {
    try {
      const entries = await CalendarEntryModel.listEntries();
      res.json(entries);
    } catch (error) {
      console.error('Calendar list error:', error);
      res.status(500).json({ error: 'Failed to load calendar entries' });
    }
  }

  static async createEntry(req: Request, res: Response) {
    try {
      const { category, date, dutyHours, districtWorked, specialStatus, color } = req.body as {
        category?: string;
        date?: string;
        dutyHours?: string | number;
        districtWorked?: string;
        specialStatus?: string;
        color?: string;
      };
      const hours = Number(dutyHours);

      if (!date || Number.isNaN(hours) || hours < 0 || !districtWorked) {
        return res.status(400).json({ error: 'Date, duty hours, and district worked are required' });
      }

      const entry = await CalendarEntryModel.createEntry({
        category: category || 'General Information',
        date,
        dutyHours: String(hours),
        districtWorked,
        specialStatus: specialStatus || 'None',
        color: color || '#9C865C',
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Calendar create error:', error);
      res.status(500).json({ error: 'Failed to create calendar entry' });
    }
  }

  static async deleteEntry(req: Request, res: Response) {
    try {
      const deleted = await CalendarEntryModel.deleteEntry(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: 'Calendar entry not found' });
      }

      res.json({ message: 'Calendar entry deleted successfully' });
    } catch (error) {
      console.error('Calendar delete error:', error);
      res.status(500).json({ error: 'Failed to delete calendar entry' });
    }
  }
}

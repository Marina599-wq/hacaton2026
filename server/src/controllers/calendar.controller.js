import { calendarService } from '../services/calendar.service.js';

export class CalendarController {
  async events(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const events = await calendarService.getEvents(userId);
    res.json(events);
  }
}

export const calendarController = new CalendarController();
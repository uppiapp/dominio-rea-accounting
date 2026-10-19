import { EconomicDuality, EconomicEvent } from './types';

export class REAEventStore {
  private events: Map<string, EconomicEvent> = new Map();
  private dualities: Map<string, EconomicDuality> = new Map();

  appendEvent(event: EconomicEvent): EconomicEvent {
    this.events.set(event.id, event);
    return event;
  }

  appendDuality(duality: EconomicDuality): EconomicDuality {
    this.dualities.set(duality.id, duality);
    for (const evt of [...duality.incrementEvents, ...duality.decrementEvents]) {
      this.events.set(evt.id, evt);
    }
    return duality;
  }

  getEvent(id: string): EconomicEvent | undefined {
    return this.events.get(id);
  }

  getAllEvents(): EconomicEvent[] {
    return Array.from(this.events.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  getDuality(id: string): EconomicDuality | undefined {
    return this.dualities.get(id);
  }

  getAllDualities(): EconomicDuality[] {
    return Array.from(this.dualities.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  clear(): void {
    this.events.clear();
    this.dualities.clear();
  }
}

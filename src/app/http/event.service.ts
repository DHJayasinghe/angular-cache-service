import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class EventService {
  public events = new Subject<Events>();

  constructor(private logger: LoggingService) { }

  public dispatch(event: Events) {
    this.logger.log(`Dispatching event: ${event.toString()}`);
    this.events.next(event);
  }
}

export enum Events {
  SomethingChangedEvent
}

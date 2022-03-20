import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LoggingService {
  log(message: any) {
    if (environment.production) return;
    console.log(message);
  }

  warn(message: any) {
    if (environment.production) return;
    console.warn(message);
  }

  error(message: any) {
    if (environment.production) return;
    console.error(message);
  }
}


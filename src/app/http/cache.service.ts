import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap, throwError } from 'rxjs';
import { EventService, Events } from './event.service';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private store = new Map<string, BehaviorSubject<any>>();
  private scope = new Map<string, string>();
  private fallbacksToRefresh = new Map<string, FallbackState>();
  private invalidationRules = new Map<Events, Set<string>>();

  constructor(
    private eventService: EventService,
    private logger: LoggingService
  ) {
    // when an event occurrs, refresh the cache via calling the callbacks
    this.eventService.events.subscribe((event) => this.invalidateCache(event));
  }

  /**
   * Gets the value from cache if the scope and the key is same as the previous.
   * If not, create a new cache slot (BehaviorSubject) and perform the backend API call,
   * then return the observable. Once the backend API call is finishes, cache the value
   * and notify the observers
   */
  public get(
    scope: string,
    key: string,
    fallback: Observable<any>,
    whenToRefresh: Events[]
  ): Observable<any> {
    if (!fallback || !(fallback instanceof Observable))
      return throwError(() => 'Fallback is required');

    this.logger.log(scope + key);

    this.saveInvalidationRules(scope, whenToRefresh);

    if (this.scope.has(scope) && this.scope.get(scope) === key) {
      this.logger.log(`Getting from cache ${scope}_${key}`);
      return this.store.get(scope).asObservable();
    }

    this.logger.log(`Executing callback for scope change: ${scope}`);
    this.createNewCacheSlot(scope, key, fallback);
    fallback.subscribe((value) => this.notifyAllObservers(scope, value));

    return this.store.get(scope).asObservable();
  }

  public clear() {
    this.store = new Map<string, BehaviorSubject<any>>();
    this.scope = new Map<string, string>();
    this.fallbacksToRefresh = new Map<string, FallbackState>();
  }

  private createNewCacheSlot(
    scope: string,
    key: string,
    fallback: Observable<any>
  ) {
    this.store.set(scope, new BehaviorSubject(null));
    this.scope.set(scope, key);
    this.fallbacksToRefresh.set(scope, new FallbackState(fallback));
  }

  private notifyAllObservers(key: string, value: any): void {
    if (!this.store.has(key)) return;

    const inFlight = this.store.get(key);
    inFlight.next(value);
  }

  private saveInvalidationRules(scope: string, whenToInvalidate: Events[]) {
    whenToInvalidate.forEach((event) => {
      if (!this.invalidationRules.has(event))
        this.invalidationRules.set(event, new Set<string>());

      const rule = this.invalidationRules.get(event);
      rule.add(scope);
    });
  }

  private invalidateCache(event: Events) {
    const scopesToInvalidate = this.invalidationRules.get(event);
    if (!scopesToInvalidate) return;
    scopesToInvalidate.forEach((scope) => {
      if (!this.store.get(scope).observed) {
        this.clearCache(scope);
        return;
      }
      this.processFallbackAndRefreshCache(scope);
    });
  }

  private processFallbackAndRefreshCache(scope: string) {
    if (!this.fallbacksToRefresh.has(scope)) return;

    const fallback = this.fallbacksToRefresh.get(scope);
    if (!fallback.canProcess()) {
      this.logger.log(
        `Invalidation is in-progress or holding exclusive lock on: ${scope}`
      );
      return;
    }

    this.logger.log(`Refreshing cache via calling fallback on scope: ${scope}`);
    fallback.process().subscribe((value) => {
      this.notifyAllObservers(scope, value);
    });
  }
  private clearCache(scope: string) {
    this.store.delete(scope);

    this.scope.delete(scope);
  }
}

export class FallbackState {
  private timeToHoldLockInSecs = 1;

  value: Observable<any>;
  processing: boolean;
  exclusiveLock: Date;

  constructor(value: Observable<any>) {
    this.value = value;
    (this.processing = false), (this.exclusiveLock = new Date());
  }

  public holdLock() {
    const lockExpiry = new Date();
    lockExpiry.setSeconds(lockExpiry.getSeconds() + this.timeToHoldLockInSecs);
    this.exclusiveLock = lockExpiry;
  }

  public releaseLock() {
    this.exclusiveLock = new Date();
  }

  private isLockExpired() {
    return this.exclusiveLock < new Date();
  }

  public canProcess() {
    return !this.processing && this.isLockExpired();
  }
  public process() {
    this.processing = true;
    return this.value.pipe(
      tap({
        next: () => {
          this.processing = false;
          this.holdLock();
        },
        error: () => {
          this.releaseLock();
          this.processing = false;
        },
      })
    );
  }
}
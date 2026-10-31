import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { App } from './app';
import { LoginComponent } from './components/login/login';
import { ApplicationFormService } from './services/application-form.service';
import { AuthService } from './services/auth.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: Router,
          useValue: {
            url: '/',
            events: of(),
            navigate: jasmine.createSpy('navigate'),
            navigateByUrl: jasmine.createSpy('navigateByUrl'),
          },
        },
        {
          provide: AuthService,
          useValue: {
            getSessionUserId: () => 'email@company.com',
            getSessionUser: () => ({ name: 'Afraz Siddiqui' }),
            logout: () => undefined,
          },
        },
        {
          provide: ApplicationFormService,
          useValue: {
            getSignedInUserRecord: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should derive initials from the signed-in user name', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as any;

    expect(app.profileAvatarInitials()).toBe('AS');
  });
});

describe('LoginComponent', () => {
  it('should create a frontend-only session before navigating', () => {
    const order: string[] = [];
    const router = {
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true)),
    };
    const route = {
      snapshot: {
        queryParamMap: {
          get: () => null,
        },
      },
    };
    const authService = {
      login: jasmine.createSpy('login').and.callFake(() => order.push('login')),
      isLoggedIn: jasmine.createSpy('isLoggedIn').and.returnValue(false),
    };

    router.navigateByUrl.and.callFake(() => {
      order.push('navigate');
      return Promise.resolve(true);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
        { provide: AuthService, useValue: authService },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    component.submit();

    expect(order).toEqual(['login', 'navigate']);
  });
});

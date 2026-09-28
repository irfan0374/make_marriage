import { APP_NAME } from '@/config/app';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-muted-foreground max-w-md">
        Plan every event, invite every family, and collect RSVPs in one place.
      </p>
    </main>
  );
}

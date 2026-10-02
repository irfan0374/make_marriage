import { BackToWeddings } from './back-to-weddings';
import { CreateWeddingForm } from './create-wedding-form';
import { SimpleHeader } from './simple-header';

export function CreateWeddingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SimpleHeader />
      <main className="flex flex-1 flex-col items-center px-5 py-10 md:py-16">
        <BackToWeddings />
        <div className="border-border bg-surface rounded-card w-full max-w-xl border p-6 shadow-sm md:p-10">
          <h1 className="text-3xl">Let&apos;s set up your wedding</h1>
          <p className="text-text-muted mt-2 text-sm">
            Just the basics. You can change any of this later.
          </p>
          <div className="mt-8">
            <CreateWeddingForm />
          </div>
        </div>
        <p className="text-text-muted mt-6 max-w-xl text-center text-xs">
          You&apos;ll be the admin of this wedding. You can invite your partner and family next.
        </p>
      </main>
    </div>
  );
}

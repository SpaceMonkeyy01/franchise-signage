
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background text-center">
      <Card className="max-w-md w-full shadow-lg border transition hover:shadow-[0_0_30px_-5px] hover:shadow-primary/40">
        <CardContent className="py-10">
          <h1 className="text-8xl font-bold text-primary mb-4">404</h1>

          <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>

          <p className="text-muted-foreground mb-8">
            Oops… The page you are looking for doesn’t exist or may have been
            moved.
          </p>

          <Button
            size="lg"
            className="btn-primary"
            onClick={() => (window.location.href = "/")}
          >
            Go back home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

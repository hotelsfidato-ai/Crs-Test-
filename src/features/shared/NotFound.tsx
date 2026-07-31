import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { Page, Button, Card } from "@/components/ui";

export function NotFound() {
  return (
    <Page>
      <Card className="max-w-lg mx-auto mt-12">
        <div className="flex flex-col items-center text-center px-6 py-12">
          <div className="flex items-center justify-center size-11 rounded-full bg-grey-100 text-grey-400 mb-4">
            <FileQuestion className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-ink-900">Page not found</h1>
          <p className="text-base text-grey-500 mt-2 max-w-sm leading-relaxed">
            The page you were looking for does not exist, or the record has been merged
            or removed.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </Page>
  );
}

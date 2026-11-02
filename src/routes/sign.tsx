import { createFileRoute } from "@tanstack/react-router";
import { SigningWorkspace } from "@/components/SigningWorkspace";

export const Route = createFileRoute("/sign")({
  head: () => ({
    meta: [
      { title: "Waraqah — Add signature" },
      {
        name: "description",
        content: "Add a visual signature to a selected PDF page privately on your device.",
      },
      { property: "og:title", content: "Waraqah — Add signature" },
      {
        property: "og:description",
        content: "Draw or import a signature and export a separate signed PDF on-device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SigningPage,
});

function SigningPage() {
  return <SigningWorkspace />;
}

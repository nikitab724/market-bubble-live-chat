import { CountAnimation } from "@/components/ui/count-animation";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function CountAnimationExamle() {
  return (
    <>
      <CountAnimation number={60} className="text-4xl" />
    </>
  );
}

function DefaultToggle() {
  return (
    <div className="space-y-2 text-center">
      <div className="flex justify-center">
        <ThemeToggle />
      </div>
    </div>
  );
}

export { CountAnimationExamle, DefaultToggle };

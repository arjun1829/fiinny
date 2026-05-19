import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type PageHeaderProps = {
  title: string;
  description?: string;
  helperKey?: HelperTextKey;
};

export function PageHeader({ title, description, helperKey }: PageHeaderProps) {
  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface md:text-3xl">
          {title}
        </h1>
        {helperKey ? (
          <HelperIcon
            size="sm"
            variant="ghost"
            side="right"
            textKey={helperKey}
            ariaLabel={`${title} help`}
          />
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-on-surface-variant md:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}

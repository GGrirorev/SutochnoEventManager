import { useState } from "react";
import { Code, Copy, Check } from "lucide-react";
import { Button } from "../../client/src/components/ui/button";
import { Badge } from "../../client/src/components/ui/badge";

interface EventProperty {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface EventData {
  category: string;
  action: string;
  name?: string;
  platforms: string[];
  properties?: EventProperty[];
}

interface MatomoCodeGeneratorProps {
  event: EventData;
}

export function MatomoCodeGenerator({ event }: MatomoCodeGeneratorProps) {
  const [copied, setCopied] = useState<string | null>(null);
  
  const generateMatomoCode = (platform: string) => {
    const category = event.category || 'Category';
    const action = event.action || 'Action';
    const name = event.name || '';
    
    const propsComment = event.properties?.length 
      ? `\n// Properties: ${event.properties.map((p) => p.name).join(', ')}`
      : '';
    
    if (platform === 'web') {
      return `// ${action}${propsComment}
_paq.push(['trackEvent', '${category}', '${action}'${name ? `, '${name}'` : ''}]);`;
    } else if (platform === 'ios') {
      return `// ${action}${propsComment}
MatomoTracker.shared.track(eventWithCategory: "${category}", action: "${action}"${name ? `, name: "${name}"` : ''})`;
    } else if (platform === 'android') {
      return `// ${action}${propsComment}
TrackHelper.track().event("${category}", "${action}")${name ? `.name("${name}")` : ''}.with(tracker)`;
    }
    return '';
  };

  const copyToClipboard = async (code: string, platform: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  const platforms = event.platforms || ['web'];
  const supportedPlatforms = platforms.filter(p => ['web', 'ios', 'android'].includes(p));

  if (supportedPlatforms.length === 0) {
    return null;
  }

  return (
    <div className="border-t pt-4" data-testid="plugin-code-generator">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Code className="w-4 h-4" />
        Код для Matomo
      </h4>
      <div className="space-y-3">
        {supportedPlatforms.map((platform: string) => {
          const code = generateMatomoCode(platform);
          return (
            <div key={platform} className="relative">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="secondary" className="uppercase text-[10px]">
                  {platform}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => copyToClipboard(code, platform)}
                  data-testid={`button-copy-code-${platform}`}
                >
                  {copied === platform ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span className="ml-1">{copied === platform ? 'Скопировано' : 'Копировать'}</span>
                </Button>
              </div>
              <pre className="text-xs font-mono bg-muted p-3 rounded border overflow-x-auto">
                <code>{code}</code>
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const pluginInfo = {
  id: "code-generator",
  name: "Генератор кода Matomo",
  component: MatomoCodeGenerator,
};

export default MatomoCodeGenerator;

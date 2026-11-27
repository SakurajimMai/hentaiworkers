import { GlobalAdScripts } from '@/components/global-ad-scripts';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

async function readPublicAdScripts() {
  try {
    return (await getSystemSettingsService().getPublicAdsConfig()).scripts;
  } catch {
    return { socialBar: '', popunder: '' };
  }
}

export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const adScripts = await readPublicAdScripts();
  return (
    <>
      {children}
      <GlobalAdScripts socialBar={adScripts.socialBar} popunder={adScripts.popunder} />
    </>
  );
}

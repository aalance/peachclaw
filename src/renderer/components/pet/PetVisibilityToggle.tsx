import { FaceSmileIcon } from '@heroicons/react/24/outline';
import { FaceSmileIcon as FaceSmileSolid } from '@heroicons/react/24/solid';
import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';

/**
 * Small header button to summon / hide the desktop pet (调出/隐藏桌宠).
 * Self-contained so the large CoworkView stays untouched.
 */
const PetVisibilityToggle: React.FC = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let mounted = true;
    void window.electron.pet.getVisible().then((state) => {
      if (mounted) setVisible(state.visible);
    }).catch(() => undefined);
    const unsubscribe = window.electron.pet.onVisibilityChanged(({ visible: next }) => {
      setVisible(next);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const toggle = async () => {
    const next = !visible;
    setVisible(next); // optimistic
    try {
      const result = await window.electron.pet.setVisible(next);
      setVisible(result.visible);
    } catch {
      setVisible(!next); // revert on failure
    }
  };

  const label = visible ? i18nService.t('petHide') : i18nService.t('petShow');

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      className={`mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors ${
        visible
          ? 'text-primary hover:bg-surface-raised'
          : 'text-secondary hover:bg-surface-raised'
      }`}
    >
      {visible ? <FaceSmileSolid className="h-4 w-4" /> : <FaceSmileIcon className="h-4 w-4" />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
};

export default PetVisibilityToggle;

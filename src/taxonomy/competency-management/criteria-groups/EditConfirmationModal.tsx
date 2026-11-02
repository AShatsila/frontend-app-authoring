import { ReactNode, useState } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Error } from '@openedx/paragon/icons';

import AlertMessage from '@src/generic/alert-message';
import DeleteModal from '@src/generic/delete-modal/DeleteModal';
import messages from './messages';

export interface EditConfirmationModalProps {
  isOpen: boolean;
  title: string;
  /** The dialog's paragraphs. */
  body: ReactNode;
  /** Text under the "Couldn't save this change" heading when `onConfirm` rejects. */
  errorText: string;
  /** Performs the save. A rejection keeps the dialog open and shows the error. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Shared confirmation for rule edits (#775). A rejection keeps it open with an alert
 * so the author can retry.
 */
const EditConfirmationModal = ({
  isOpen,
  title,
  body,
  errorText,
  onConfirm,
  onCancel,
}: EditConfirmationModalProps) => {
  const intl = useIntl();
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = async () => {
    setHasError(false);
    setIsSaving(true);
    try {
      await onConfirm();
    } catch {
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setHasError(false);
    onCancel();
  };

  return (
    <DeleteModal
      isOpen={isOpen}
      title={title}
      buttonVariant="primary"
      btnLabel={intl.formatMessage(messages.editConfirmationSaveButton)}
      close={handleCancel}
      isPending={isSaving}
      onDeleteSubmit={handleConfirm}
      description={
        <>
          {hasError && (
            <AlertMessage
              variant="danger"
              icon={Error}
              title={intl.formatMessage(messages.editConfirmationErrorHeading)}
              description={errorText}
            />
          )}
          {body}
        </>
      }
    />
  );
};

export default EditConfirmationModal;

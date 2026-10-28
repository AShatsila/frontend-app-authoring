import { ReactNode, useEffect, useState } from 'react';
import { useIntl } from '@edx/frontend-platform/i18n';
import { Alert } from '@openedx/paragon';
import { Error } from '@openedx/paragon/icons';

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

  useEffect(() => {
    if (!isOpen) {
      setHasError(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setHasError(false);
    try {
      await onConfirm();
    } catch {
      setHasError(true);
    }
  };

  return (
    <DeleteModal
      isOpen={isOpen}
      title={title}
      buttonVariant="primary"
      btnLabel={intl.formatMessage(messages.editConfirmationSaveButton)}
      close={onCancel}
      onDeleteSubmit={handleConfirm}
      description={
        <>
          {hasError && (
            <Alert variant="danger" icon={Error}>
              <Alert.Heading>{intl.formatMessage(messages.editConfirmationErrorHeading)}</Alert.Heading>
              <p>{errorText}</p>
            </Alert>
          )}
          {body}
        </>
      }
    />
  );
};

export default EditConfirmationModal;

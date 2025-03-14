import type { IMessage, IRoom, ISubscription, IUser } from '@rocket.chat/core-typings';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';

import { CachedChatSubscription } from '../../../app/models/client';
import { Notifications } from '../../../app/notifications/client';
import { readMessage } from '../../../app/ui-utils/client';
import { KonchatNotification } from '../../../app/ui/client';
import { getUserPreference } from '../../../app/utils/client';
import { RoomManager } from '../../lib/RoomManager';
import { fireGlobalEvent } from '../../lib/utils/fireGlobalEvent';
import { isLayoutEmbedded } from '../../lib/utils/isLayoutEmbedded';

const notifyNewRoom = (sub: ISubscription): void => {
	const user = Meteor.user() as IUser | null;
	if (!user || user.status === 'busy') {
		return;
	}

	if ((!FlowRouter.getParam('name') || FlowRouter.getParam('name') !== sub.name) && !sub.ls && sub.alert === true) {
		KonchatNotification.newRoom(sub.rid);
	}
};

type NotificationEvent = {
	title: string;
	text: string;
	duration: number;
	payload: {
		_id: IMessage['_id'];
		rid: IMessage['rid'];
		tmid: IMessage['_id'];
		sender: IMessage['u'];
		type: IRoom['t'];
		name: IRoom['name'];
		message: {
			msg: IMessage['msg'];
			t: string;
		};
	};
};

function notifyNewMessageAudio(rid: string): void {
	// This logic is duplicated in /client/startup/unread.coffee.
	const hasFocus = readMessage.isEnable();
	const messageIsInOpenedRoom = RoomManager.opened === rid;
	const muteFocusedConversations = getUserPreference(Meteor.userId(), 'muteFocusedConversations');

	if (isLayoutEmbedded()) {
		if (!hasFocus && messageIsInOpenedRoom) {
			// Play a notification sound
			KonchatNotification.newMessage(rid);
		}
	} else if (!hasFocus || !messageIsInOpenedRoom || !muteFocusedConversations) {
		// Play a notification sound
		KonchatNotification.newMessage(rid);
	}
}

Meteor.startup(() => {
	Tracker.autorun(() => {
		if (!Meteor.userId()) {
			return;
		}

		Notifications.onUser('notification', (notification: NotificationEvent) => {
			const openedRoomId = ['channel', 'group', 'direct'].includes(FlowRouter.getRouteName()) ? RoomManager.opened : undefined;

			// This logic is duplicated in /client/startup/unread.coffee.
			const hasFocus = readMessage.isEnable();
			const messageIsInOpenedRoom = openedRoomId === notification.payload.rid;

			fireGlobalEvent('notification', {
				notification,
				fromOpenedRoom: messageIsInOpenedRoom,
				hasFocus,
			});

			if (isLayoutEmbedded()) {
				if (!hasFocus && messageIsInOpenedRoom) {
					// Show a notification.
					KonchatNotification.showDesktop(notification);
				}
			} else if (!hasFocus || !messageIsInOpenedRoom) {
				// Show a notification.
				KonchatNotification.showDesktop(notification);
			}

			notifyNewMessageAudio(notification.payload.rid);
		});

		CachedChatSubscription.on('changed', (sub): void => {
			notifyNewRoom(sub);
		});

		Notifications.onUser('subscriptions-changed', (_action: 'changed' | 'removed', sub: ISubscription) => {
			notifyNewRoom(sub);
		});
	});
});

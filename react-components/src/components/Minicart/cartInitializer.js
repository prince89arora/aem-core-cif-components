/*******************************************************************************
 *
 *    Copyright 2019 Adobe. All rights reserved.
 *    This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License. You may obtain a copy
 *    of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software distributed under
 *    the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *    OF ANY KIND, either express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 *
 ******************************************************************************/
import { useEffect } from 'react';
import { useCartState } from './cartContext';
import { useCookieValue } from '../../utils/hooks';
import { useMutation, useApolloClient } from '@apollo/react-hooks';
import { useUserContext } from '../../context/UserContext';

import parseError from '../../utils/parseError';

import MUTATION_CREATE_CART from '../../queries/mutation_create_guest_cart.graphql';
import CART_DETAILS_QUERY from '../../queries/query_cart_details.graphql';
import MUTATION_REMOVE_ITEM from '../../queries/mutation_remove_item.graphql';
import MUTATION_ADD_TO_CART from '../../queries/mutation_add_to_cart.graphql';
import MUTATION_ADD_COUPON from '../../queries/mutation_add_coupon.graphql';
import MUTATION_REMOVE_COUPON from '../../queries/mutation_remove_coupon.graphql';
import QUERY_CUSTOMER_CART from '../../queries/query_customer_cart.graphql';
import MUTATION_MERGE_CARTS from '../../queries/mutation_merge_carts.graphql';

const CartInitializer = props => {
    const apolloClient = useApolloClient();

    const [{ cartId: stateCartId, isRegistered }, dispatch] = useCartState();
    const [{ isSignedIn }] = useUserContext();
    const CART_COOKIE = 'cif.cart';

    const [cartId, setCartCookie] = useCookieValue(CART_COOKIE);

    const [createCart, { data: createAnonCartData, error: createAnonCartError }] = useMutation(MUTATION_CREATE_CART);
    const [addItem] = useMutation(MUTATION_ADD_TO_CART);
    const [removeItem] = useMutation(MUTATION_REMOVE_ITEM);
    const [addCoupon] = useMutation(MUTATION_ADD_COUPON);
    const [removeCoupon] = useMutation(MUTATION_REMOVE_COUPON);

    const createCartHandlers = (cartId, dispatch) => {
        return {
            addItem: ev => {
                if (!ev.detail) return;
                const { sku, quantity } = ev.detail;
                dispatch({ type: 'open' });
                dispatch({ type: 'beginLoading' });
                return addItem({
                    variables: { cartId, sku, quantity },
                    refetchQueries: [{ query: CART_DETAILS_QUERY, variables: { cartId } }],
                    awaitRefetchQueries: true
                })
                    .catch(error => {
                        dispatch({ type: 'error', error: error.toString() });
                    })
                    .finally(() => {
                        dispatch({ type: 'endLoading' });
                    });
            },
            removeItem: itemId => {
                dispatch({ type: 'beginLoading' });
                return removeItem({
                    variables: { cartId, itemId },
                    refetchQueries: [{ query: CART_DETAILS_QUERY, variables: { cartId } }],
                    awaitRefetchQueries: true
                })
                    .catch(error => {
                        dispatch({ type: 'error', error: error.toString() });
                    })
                    .finally(() => {
                        dispatch({ type: 'endLoading' });
                    });
            },
            addCoupon: couponCode => {
                dispatch({ type: 'beginLoading' });
                return addCoupon({
                    variables: { cartId, couponCode },
                    refetchQueries: [{ query: CART_DETAILS_QUERY, variables: { cartId } }],
                    awaitRefetchQueries: true
                })
                    .catch(error => {
                        dispatch({ type: 'couponError', error: parseError(error) });
                    })
                    .finally(() => {
                        dispatch({ type: 'endLoading' });
                    });
            },
            removeCoupon: () => {
                dispatch({ type: 'beginLoading' });
                return removeCoupon({
                    variables: { cartId },
                    refetchQueries: [{ query: CART_DETAILS_QUERY, variables: { cartId } }],
                    awaitRefetchQueries: true
                })
                    .catch(error => {
                        dispatch({ type: 'error', error: error.toString() });
                    })
                    .finally(() => {
                        dispatch({ type: 'endLoading' });
                    });
            }
        };
    };

    useEffect(() => {
        // create the guest cart if the user is not signed in
        if (!isSignedIn && (!cartId || cartId.length === 0)) {
            createCart();
        }
    }, [cartId]);

    useEffect(() => {
        // merge the shopping carts if necessary
        async function fetchData() {
            const { data, error } = await apolloClient.query({
                query: QUERY_CUSTOMER_CART
            });
            if (error) {
                console.error(`Error fetching the customer cart`, error);
                dispatch({ type: 'error', error: error.toString() });
            }
            if (data) {
                const customerCartId = data.customerCart.id;
                if (customerCartId === cartId) return;
                const { data: mergeCartsData, error: mergeCartsError } = await apolloClient.mutate({
                    mutation: MUTATION_MERGE_CARTS,
                    variables: {
                        sourceCartId: stateCartId,
                        destinationCartId: customerCartId
                    }
                });

                if (mergeCartsData) {
                    setCartCookie(mergeCartsData.mergeCarts.id);
                    dispatch({ type: 'cartId', cartId: cartId, methods: createCartHandlers(cartId, dispatch) });
                    dispatch({ type: 'register' });
                }

                if (mergeCartsError) {
                    dispatch({ type: 'error', error: mergeCartsError.toString() });
                }
            }
        }

        if (isSignedIn && !isRegistered) {
            fetchData();
        }
    }, [isSignedIn]);

    useEffect(() => {
        if (cartId && stateCartId !== cartId) {
            dispatch({ type: 'cartId', cartId: cartId, methods: createCartHandlers(cartId, dispatch) });
        }
    }, [cartId, stateCartId]);

    useEffect(() => {
        if (createAnonCartData) {
            setCartCookie(createAnonCartData.createEmptyCart);
            dispatch({
                type: 'cartId',
                cartId: createAnonCartData.createEmptyCart,
                methods: createCartHandlers(createAnonCartData.createEmptyCart, dispatch)
            });
        }

        if (createAnonCartError) {
            dispatch({ type: 'error', error: createAnonCartError.toString() });
        }
    }, [createAnonCartData, createAnonCartError]);

    return props.children;
};

export default CartInitializer;
